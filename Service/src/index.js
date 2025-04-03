const express = require('express');
const sheetsApi = require('./api/googleSheetsApi');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// API Authentication token
// In production, this should be stored in environment variables
const API_TOKEN = process.env.API_TOKEN || 'YOUR_SECURE_API_TOKEN_HERE';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Function to send messages to Discord webhook
async function sendToDiscord(title, description, fields, department) {
  const webhookUrl = departmentToWebhook[department];
  if (!webhookUrl) {
    console.warn('Discord webhook URL not configured. Skipping webhook notification.');
    return;
  }

  try {
    const embed = {
      title: title,
      description: description,
      color: 3447003, // Blue color
      fields: fields,
      timestamp: new Date().toISOString()
    };
    
    const data = {
      embeds: [embed]
    };
    
    await axios.post(webhookUrl, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Discord webhook notification sent successfully');
  } catch (error) {
    console.error('Failed to send Discord webhook notification:', error.message);
  }
}

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
  'FMB': '1hfqaBA_a0jr9iJLKmQ_xZ5kiwP5XL-3eXK9uE_bCx_o',
};

const departmentToWebhook = {
  'FMB': ''
}

const fieldMappings = {
  'ft': 'FUNDA. TRAINING(S)'
}

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
    const caller = req.body.invoker || 'Unknown';
    // Validate request body
 
    if (!Array.isArray(req.body.payloads) || req.body.payloads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be a non-empty array of update objects'
      });
    }

    // Send initial webhook notification about command usage
    const targetNames = req.body.payloads.map(update => update.name).join(', ');
    const departmentName = req.body.payloads[0]?.department || 'Unknown';

    const fieldName = fieldMappings[req.body.payloads[0]?.field] || req.body.payloads[0]?.field || 'Unknown';
    const incrementValue = req.body.payloads[0]?.increment || 1;
    
    await sendToDiscord(
      'Activity Command Used',
      `A staff member is recording activity in the spreadsheet.`,
      [
        { name: 'Command Issuer', value: caller, inline: true },
        { name: 'Department', value: departmentName, inline: true },
        { name: 'Field', value: fieldName, inline: true },
        { name: 'Increment', value: String(incrementValue), inline: true },
        { name: 'Target Players', value: targetNames, inline: false }
      ],
      departmentName
    );

    // Process each update request
    const results = [];
    for (const update of req.body.payloads) {
      // Validate required fields
      if (!update.name || !update.department || !update.field) {
        results.push({
          success: false,
          name: update.name || 'unknown',
          department: update.department || 'unknown',
          field: fieldName || 'unknown',
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
          field: fieldName,
          message: `Unknown department: ${update.department}`
        });
        continue;
      }

      // Set default increment to 1 if not specified
      const increment = update.increment !== undefined ? update.increment : 1;

      // Get the mapped field name or use the original
      const mappedFieldName = fieldMappings[update.field] || update.field;

      // Perform the increment operation - search across all sheets
      const incrementResult = await sheetsApi.findAndIncrementColumnValueAcrossSheets(
        spreadsheetId,
        update.name,
        mappedFieldName,
        increment,
        'USERNAME'  // Name column to search for
      );

      // Add the result to the results array
      results.push({
        ...incrementResult,
        name: update.name,
        department: update.department,
        field: mappedFieldName,
        increment: increment
      });

      let logMessage = '';
      if (incrementResult.success) {
        logMessage = `Successfully incremented ${mappedFieldName} for user ${update.name} in department ${update.department}, sheet ${incrementResult.sheetName}`;
      } else {
        logMessage = `Failed to increment ${mappedFieldName} for user ${update.name} in department ${update.department}: ${incrementResult.message}`;
      }
      console.log(logMessage);
    }

    // Count successful and failed updates
    const successfulUpdates = results.filter(result => result.success).length;
    const failedUpdates = results.filter(result => !result.success).length;

    // Send results to Discord webhook
    if (successfulUpdates > 0) {
      // const successDetails = results
      //   .filter(result => result.success)
      //   .map(result => `${result.name}: ${result.field} in ${result.sheetName || 'unknown sheet'} (${result.previousValue} → ${result.newValue})`)
      //   .join('\n');
        
      // await sendToDiscord(
      //   'Activity Command Results',
      //   `Successfully updated ${successfulUpdates} player(s), ${failedUpdates} failed.`,
      //   [
      //     { name: 'Command Issuer', value: caller, inline: true },
      //     { name: 'Status', value: 'Success', inline: true },
      //     { name: 'Department', value: departmentName, inline: true },
      //     { name: 'Details', value: successDetails, inline: false }
      //   ],
      //   departmentName
      // );
    } else {
      // All updates failed
      const errorMessages = results
        .filter(result => !result.success)
        .map(result => `${result.name}: ${result.message}`)
        .join('\n');
      
      await sendToDiscord(
        'Activity Command Failed',
        `Failed to record activity in the spreadsheet.`,
        [
          { name: 'Command Issuer', value: caller, inline: true },
          { name: 'Department', value: departmentName, inline: true },
          { name: 'Errors', value: errorMessages || 'Unknown error', inline: false }
        ],
        departmentName
      );
    }

    // Return the results
    return res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Error in update-fields endpoint:', error);
    
    // Send error to Discord webhook
    await sendToDiscord(
      'Activity Command Error',
      'An error occurred while processing the activity command.',
      [
        { name: 'Error', value: error.message, inline: false }
      ],
      departmentName
    );
    
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