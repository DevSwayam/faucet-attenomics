// index.js - Complete Express server with Firebase integration for access code system

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin SDK
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : require("./serviceAccountKey.json"); // Fallback to a local file if not in env

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ||
    `https://${serviceAccount.project_id}.firebaseio.com`,
});

const db = admin.firestore();
const codesCollection = db.collection("accessCodes");
const usersCollection = db.collection("users");

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const adminKey =
    req.headers["x-admin-key"] || req.body.adminKey || req.query.adminKey;

  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Admin privileges required." });
  }

  next();
};

// API Routes

/**
 * Check if a user is authorized
 * POST /api/check-access
 */
app.post("/api/check-access", async (req, res) => {
  try {
    const { userId, walletAddress } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check if user exists in the database
    const userDoc = await usersCollection.doc(userId).get();

    if (!userDoc.exists) {
      return res.status(200).json({ isAuthorized: false });
    }

    const userData = userDoc.data();

    // Check if user is authorized based on criteria
    const isAuthorized =
      userData.status === "active" &&
      (!walletAddress || userData.walletAddress === walletAddress);

    return res.status(200).json({ isAuthorized });
  } catch (error) {
    console.error("Error checking access:", error);
    return res
      .status(500)
      .json({ error: "Failed to check authorization", details: error.message });
  }
});

/**
 * Validate an access code and authorize a user
 * POST /api/validate-code
 */
app.post("/api/validate-code", async (req, res) => {
    try {
      const { code, userId } = req.body;
  
      if (!code || code.length !== 6) {
        return res
          .status(400)
          .json({ valid: false, error: "Invalid code format" });
      }
  
      if (!userId) {
        return res
          .status(400)
          .json({ valid: false, error: "userId is required" });
      }
  
      // Query Firestore for the code
      const codeSnapshot = await codesCollection
        .where("code", "==", code.toUpperCase())
        .where("status", "==", "active")
        .get();
  
      if (codeSnapshot.empty) {
        return res.status(200).json({ valid: false, error: "Invalid code" });
      }
  
      const codeDoc = codeSnapshot.docs[0];
      const codeDocRef = codesCollection.doc(codeDoc.id);
  
      // Use a transaction to ensure atomicity when checking and updating the code
      const result = await db.runTransaction(async (transaction) => {
        const codeSnapshot = await transaction.get(codeDocRef);
        const codeData = codeSnapshot.data();
  
        // Check if code is expired
        if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
          transaction.update(codeDocRef, { status: "expired" });
          return { valid: false, error: "Code expired" };
        }
  
        // Check if code has reached its usage limit
        if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
          transaction.update(codeDocRef, { status: "used" });
          return { valid: false, error: "Code usage limit reached" };
        }
  
        // Check if the code is already used by any user
        if (codeData.usedBy) {
          // If this user has already used this code, allow them to reuse it
          if (codeData.usedBy === userId) {
            return { valid: true, message: "Code already used by this user" };
          } else {
            // Another user has already used this code
            return { valid: false, error: "This code has already been used by another user" };
          }
        }
  
        // Code is valid and not yet used by anyone
        // Mark it as used by this user and update the usage count
        transaction.update(codeDocRef, {
          usedCount: admin.firestore.FieldValue.increment(1),
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          usedBy: userId
        });
  
        // Also update user document
        const userRef = usersCollection.doc(userId);
        transaction.set(userRef, {
          status: "active",
          authorizedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastCode: code
        }, { merge: true });
  
        return { valid: true };
      });
  
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error validating code:", error);
      return res.status(500).json({
        valid: false,
        error: "Failed to validate code",
        details: error.message,
      });
    }
  });

/**
 * Generate a new access code (admin only)
 * POST /api/generate-code
 */
app.post("/api/generate-code", authenticateAdmin, async (req, res) => {
  try {
    const { maxUses, expiresInDays, note } = req.body;

    // Generate a random 6-character alphanumeric code
    const generateRandomCode = () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed similar-looking characters
      let result = "";
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    let code = generateRandomCode();
    // Make sure code is unique
    let codeSnapshot = await codesCollection.where("code", "==", code).get();
    while (!codeSnapshot.empty) {
      code = generateRandomCode();
      codeSnapshot = await codesCollection.where("code", "==", code).get();
    }

    // Calculate expiration date if provided
    const expiresAt = expiresInDays
      ? admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        )
      : null;

    // Create the code in Firestore
    const codeRef = await codesCollection.add({
      code,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      maxUses: maxUses || null,
      usedCount: 0,
      note: note || "",
    });

    return res.status(200).json({
      id: codeRef.id,
      code,
      expiresAt: expiresAt ? expiresAt.toDate() : null,
      maxUses,
    });
  } catch (error) {
    console.error("Error generating code:", error);
    return res
      .status(500)
      .json({ error: "Failed to generate code", details: error.message });
  }
});

/**
 * Store a username in the database (if not already stored)
 * POST /api/store-username
 */
app.post("/api/store-username", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "username is required" });
    }

    // Create a usernames collection if it doesn't exist already
    const usernamesCollection = db.collection("usernames");

    // Check if username already exists to avoid duplicates
    const usernameDoc = await usernamesCollection
      .where("username", "==", username)
      .get();

    // Only store if the username doesn't already exist
    if (usernameDoc.empty) {
      await usernamesCollection.add({
        username: username,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        message: "Username stored successfully",
      });
    } else {
      // Return success even if already exists, but with different message
      return res.status(200).json({
        success: true,
        message: "Username already exists",
      });
    }
  } catch (error) {
    console.error("Error storing username:", error);
    return res.status(500).json({
      error: "Failed to store username",
      details: error.message,
    });
  }
});

/**
 * List all stored usernames
 * GET /api/list-usernames
 */
app.get("/api/list-usernames",authenticateAdmin, async (req, res) => {
  try {
    // Reference to the usernames collection
    const usernamesCollection = db.collection("usernames");

    // Get all documents, sorted by creation time
    const snapshot = await usernamesCollection
      .orderBy("createdAt", "desc")
      .get();

    // Map the documents to a simpler format
    const usernames = snapshot.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username,
      createdAt: doc.data().createdAt?.toDate(),
    }));

    return res.status(200).json({ usernames });
  } catch (error) {
    console.error("Error listing usernames:", error);
    return res.status(500).json({
      error: "Failed to list usernames",
      details: error.message,
    });
  }
});

/**
 * List all access codes (admin only)
 * GET /api/list-codes
 */
app.get("/api/list-codes", authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = codesCollection.orderBy("createdAt", "desc");

    // Filter by status if provided
    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    const codeSnapshot = await query.get();
    const codes = codeSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      // Convert timestamps to ISO strings for JSON serialization
      createdAt: doc.data().createdAt?.toDate(),
      expiresAt: doc.data().expiresAt?.toDate(),
      lastUsedAt: doc.data().lastUsedAt?.toDate(),
    }));

    return res.status(200).json({ codes });
  } catch (error) {
    console.error("Error listing codes:", error);
    return res
      .status(500)
      .json({ error: "Failed to list codes", details: error.message });
  }
});

/**
 * Revoke an access code (admin only)
 * POST /api/revoke-code
 */
app.post("/api/revoke-code", authenticateAdmin, async (req, res) => {
  try {
    const { codeId } = req.body;

    if (!codeId) {
      return res.status(400).json({ error: "codeId is required" });
    }

    await codesCollection.doc(codeId).update({
      status: "revoked",
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error revoking code:", error);
    return res
      .status(500)
      .json({ error: "Failed to revoke code", details: error.message });
  }
});

/**
 * Get user information by ID (admin only)
 * GET /api/user/:userId
 */
app.get("/api/user/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const userDoc = await usersCollection.doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();

    // Convert Firestore timestamps to dates for JSON serialization
    const user = {
      id: userDoc.id,
      ...userData,
      authorizedAt: userData.authorizedAt?.toDate(),
      lastLogin: userData.lastLogin?.toDate(),
    };

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch user", details: error.message });
  }
});

/**
 * Update a user's wallet address
 * POST /api/update-wallet
 */
app.post("/api/update-wallet", async (req, res) => {
  try {
    const { userId, walletAddress } = req.body;

    if (!userId || !walletAddress) {
      return res
        .status(400)
        .json({ error: "userId and walletAddress are required" });
    }

    await usersCollection.doc(userId).set(
      {
        walletAddress,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating wallet:", error);
    return res.status(500).json({
      error: "Failed to update wallet address",
      details: error.message,
    });
  }
});

/**
 * Record user login
 * POST /api/record-login
 */
app.post("/api/record-login", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await usersCollection.doc(userId).set(
      {
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        loginCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error recording login:", error);
    return res
      .status(500)
      .json({ error: "Failed to record login", details: error.message });
  }
});

// Simple admin portal endpoint for generating codes
app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Access Code Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #0070f3; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0051a2; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status-active { color: green; }
        .status-expired, .status-revoked { color: red; }
        .status-used { color: orange; }
      </style>
    </head>
    <body>
      <h1>Access Code Administration</h1>
      
      <div class="card">
        <h2>Generate New Access Code</h2>
        <div class="form-group">
          <label for="adminKey">Admin Key:</label>
          <input type="password" id="adminKey" required>
        </div>
        <div class="form-group">
          <label for="maxUses">Max Uses (blank for unlimited):</label>
          <input type="number" id="maxUses" min="1">
        </div>
        <div class="form-group">
          <label for="expiresInDays">Expires In (days, blank for never):</label>
          <input type="number" id="expiresInDays" min="1">
        </div>
        <div class="form-group">
          <label for="note">Note:</label>
          <input type="text" id="note" placeholder="Optional note about this code">
        </div>
        <button onclick="generateCode()">Generate Code</button>
        <div id="generatedCode" style="margin-top: 15px;"></div>
      </div>
      
      <div class="card">
        <h2>Existing Access Codes</h2>
        <div class="form-group">
          <label for="statusFilter">Filter by Status:</label>
          <select id="statusFilter">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <button onclick="fetchCodes()">Refresh List</button>
        <div id="codesList" style="margin-top: 15px; overflow-x: auto;">
          <table id="codesTable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Uses</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="codesTableBody"></tbody>
          </table>
        </div>
      </div>
      
      <script>
        // Helper to format dates
        function formatDate(dateStr) {
          if (!dateStr) return 'Never';
          const date = new Date(dateStr);
          return date.toLocaleString();
        }
        
        // Generate a new access code
        async function generateCode() {
          const adminKey = document.getElementById('adminKey').value;
          const maxUses = document.getElementById('maxUses').value;
          const expiresInDays = document.getElementById('expiresInDays').value;
          const note = document.getElementById('note').value;
          
          if (!adminKey) {
            alert('Admin key is required');
            return;
          }
          
          try {
            const response = await fetch('/api/generate-code', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': adminKey
              },
              body: JSON.stringify({
                maxUses: maxUses ? parseInt(maxUses) : null,
                expiresInDays: expiresInDays ? parseInt(expiresInDays) : null,
                note
              })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              document.getElementById('generatedCode').innerHTML = 
                \`<strong>Generated Code:</strong> <span style="font-size: 24px; font-family: monospace;">\${data.code}</span> 
                 <p>Expires: \${formatDate(data.expiresAt)}<br>
                 Max Uses: \${data.maxUses || 'Unlimited'}</p>\`;
              fetchCodes(); // Refresh the list
            } else {
              document.getElementById('generatedCode').innerHTML = 
                \`<p style="color: red">Error: \${data.error}</p>\`;
            }
          } catch (error) {
            document.getElementById('generatedCode').innerHTML = 
              \`<p style="color: red">Error: \${error.message}</p>\`;
          }
        }
        
        // Fetch all access codes
        async function fetchCodes() {
          const adminKey = document.getElementById('adminKey').value;
          const status = document.getElementById('statusFilter').value;
          
          if (!adminKey) {
            alert('Admin key is required');
            return;
          }
          
          try {
            const response = await fetch(\`/api/list-codes?status=\${status}&adminKey=\${adminKey}\`, {
              headers: {
                'X-Admin-Key': adminKey
              }
            });
            
            const data = await response.json();
            
            if (response.ok) {
              const tableBody = document.getElementById('codesTableBody');
              tableBody.innerHTML = '';
              
              if (data.codes.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="7">No codes found</td></tr>';
                return;
              }
              
              data.codes.forEach(code => {
                const row = document.createElement('tr');
                
                row.innerHTML = \`
                  <td><code>\${code.code}</code></td>
                  <td><span class="status-\${code.status}">\${code.status}</span></td>
                  <td>\${formatDate(code.createdAt)}</td>
                  <td>\${formatDate(code.expiresAt)}</td>
                  <td>\${code.usedCount || 0}/\${code.maxUses || '∞'}</td>
                  <td>\${code.note || ''}</td>
                  <td>
                    \${code.status === 'active' ? 
                      \`<button onclick="revokeCode('\${code.id}')" style="background-color: #dc3545;">Revoke</button>\` : 
                      ''}
                  </td>
                \`;
                
                tableBody.appendChild(row);
              });
            } else {
              document.getElementById('codesList').innerHTML = 
                \`<p style="color: red">Error: \${data.error}</p>\`;
            }
          } catch (error) {
            document.getElementById('codesList').innerHTML = 
              \`<p style="color: red">Error: \${error.message}</p>\`;
          }
        }
        
        // Revoke an access code
        async function revokeCode(codeId) {
          if (!confirm('Are you sure you want to revoke this code? This cannot be undone.')) {
            return;
          }
          
          const adminKey = document.getElementById('adminKey').value;
          
          if (!adminKey) {
            alert('Admin key is required');
            return;
          }
          
          try {
            const response = await fetch('/api/revoke-code', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': adminKey
              },
              body: JSON.stringify({ codeId })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              alert('Code revoked successfully');
              fetchCodes(); // Refresh the list
            } else {
              alert(\`Error: \${data.error}\`);
            }
          } catch (error) {
            alert(\`Error: \${error.message}\`);
          }
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
          document.getElementById('statusFilter').addEventListener('change', fetchCodes);
        });
      </script>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // For testing
