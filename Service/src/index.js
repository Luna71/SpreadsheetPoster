const express = require('express');
const sheetsApi = require('./api/googleSheetsApi');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// API Authentication token
// In production, this should be stored in environment variables
const API_TOKEN = process.env.API_TOKEN || 'YOUR_SECURE_API_TOKEN_HERE';

// Middleware to verify API token
function verifyApiToken(req, res, next) {
  // Get token from Authorization header (Bearer token) or query parameter
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;
  const tokenFromQuery = req.query.api_token;
  
  // Use token from header or query parameter
  const token = tokenFromHeader || tokenFromQuery;

  // If no token provided
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'API token is required. Provide it as a Bearer token in Authorization header or as api_token query parameter.' 
    });
  }

  // If token doesn't match
  if (token !== API_TOKEN) {
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid API token' 
    });
  }

  // Token is valid, proceed to the next middleware/route handler
  next();
}


const departmentToSpreadsheetId = {
  'FMB': '1jgEkgAJ2vBE9juWX0b2agsXfQwdjRoHmOCCW0bGrT50',
};

// Example route to test API is running
app.get('/', (req, res) => {
  res.json({ message: 'SpreadsheetRanker API is running' });
});

app.use(verifyApiToken);

/**
 * POST route for updating user fields in spreadsheets
 * Body format: 
 * [
 *   {
 *     "name": "username",
 *     "department": "department_code",
 *     "field": "field_name",
 *     "increment": number_value
 *   },
 *   ...
 * ]
 */
app.post('/update-fields', async (req, res) => {
  try {
    // Validate request body
    if (!Array.isArray(req.body) || req.body.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be a non-empty array of update objects'
      });
    }

    // Process each update request
    const results = [];
    for (const update of req.body) {
      // Validate required fields
      if (!update.name || !update.department || !update.field) {
        results.push({
          success: false,
          name: update.name || 'unknown',
          department: update.department || 'unknown',
          field: update.field || 'unknown',
          message: 'Missing required fields (name, department, or field)'
        });
        continue;
      }

      // Get spreadsheet ID for the department
      const spreadsheetId = departmentToSpreadsheetId[update.department];
      if (!spreadsheetId) {
        results.push({
          success: false,
          name: update.name,
          department: update.department,
          field: update.field,
          message: `Unknown department: ${update.department}`
        });
        continue;
      }

      // Set default increment to 1 if not specified
      const increment = update.increment !== undefined ? update.increment : 1;

      // Perform the increment operation
      const incrementResult = await sheetsApi.incrementColumnValueForUser(
        spreadsheetId,
        update.name,
        update.field,
        increment,
        'Events',     // Default sheet name
        'Username'    // Default name column
      );

      // Add the result to the results array
      results.push({
        ...incrementResult,
        name: update.name,
        department: update.department,
        field: update.field,
        increment: increment
      });

      console.log(
        `${incrementResult.success ? 'Successfully' : 'Failed to'} increment ${update.field} ` +
        `for user ${update.name} in department ${update.department}`
      );
    }

    // Return the results
    return res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Error in update-fields endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`SpreadsheetRanker API server running on port ${PORT}`);
});