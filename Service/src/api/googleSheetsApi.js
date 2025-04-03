const { google } = require('googleapis');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize the Google Sheets API
class GoogleSheetsApi {
  constructor() {
    this.sheets = null;
    this.initialized = false;
    this.auth = null;
  }

  /**
   * Initialize the Google Sheets API
   * @returns {boolean} - Success status
   */
  init() {
        
      // Create auth client
      this.auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      
      // Initialize sheets API with the auth client
      this.sheets = google.sheets({
        version: 'v4',
        auth: this.auth
      });
      
      console.log('Initialized Google Sheets API with service account authentication');
      this.initialized = true;
      return true;
  }

  /**
   * Get data from a Google Sheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} range - The range to read (e.g. 'Sheet1!A1:D10')
   * @returns {Promise<Array|null>} - The data from the sheet or null if error
   */
  async getSheetData(spreadsheetId, range) {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return null;
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return response.data.values;
    } catch (error) {
      console.error('Error fetching sheet data:', error);
      return null;
    }
  }

  /**
   * Update data in a Google Sheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} range - The range to update (e.g. 'Sheet1!A1:D10')
   * @param {Array} values - The values to update
   * @param {string} valueInputOption - How to interpret the values (RAW or USER_ENTERED)
   * @returns {Promise<boolean>} - Success status
   */
  async updateSheetData(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return false;
    }

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption,
        resource: {
          values,
        },
      });

      return true;
    } catch (error) {
      console.error('Error updating sheet data:', error);
      return false;
    }
  }

  /**
   * Append data to a Google Sheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} range - The range to append to (e.g. 'Sheet1!A1')
   * @param {Array} values - The values to append
   * @param {string} valueInputOption - How to interpret the values (RAW or USER_ENTERED)
   * @returns {Promise<boolean>} - Success status
   */
  async appendSheetData(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return false;
    }

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        resource: {
          values,
        },
      });

      return true;
    } catch (error) {
      console.error('Error appending sheet data:', error);
      return false;
    }
  }

  /**
   * Find a name in a spreadsheet table
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} name - The name to search for
   * @param {string} sheetName - Optional sheet name (default: 'Sheet1')
   * @param {string} nameColumn - Optional column to search in (default: 'A')
   * @returns {Promise<{found: boolean, row?: number, rowData?: Array, allData?: Array}>} - Result object with found status and data
   */
  async findNameInSheet(spreadsheetId, name, sheetName = 'Events', nameColumn = 'A') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return { found: false };
    }

    try {
      // Standardize the name for case-insensitive comparison
      const searchName = name.toLowerCase().trim();
      
      // Get all data from the sheet
      const range = `${sheetName}!A:Z`;  // Fetch all columns to get complete row data
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      
      if (values.length === 0) {
        return { found: false, allData: [] };
      }

      // Find the column index for the name column
      const headerRow = values[0];
      let nameColumnIndex = nameColumn.toUpperCase().charCodeAt(0) - 65; // Convert A->0, B->1, etc.
      
      // If nameColumn is a string like 'Name' or 'Username', find its index
      if (nameColumn.length > 1) {
        nameColumnIndex = headerRow.findIndex(
          header => header.toLowerCase() === nameColumn.toLowerCase()
        );
        if (nameColumnIndex === -1) {
          console.error(`Column "${nameColumn}" not found in sheet headers`);
          return { found: false, allData: values };
        }
      }

      // Search for the name in the specified column
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        
        // Skip empty rows
        if (!row || row.length === 0) continue;
        
        // Check if the column exists in this row
        if (row.length > nameColumnIndex) {
          const cellValue = row[nameColumnIndex];
          
          // If cell value exists and matches the search name
          if (cellValue && cellValue.toLowerCase().trim() === searchName) {
            return {
              found: true,
              row: i + 1, // 1-indexed row number as used in Sheets
              rowData: row,
              allData: values
            };
          }
        }
      }

      // Name not found
      return { 
        found: false, 
        allData: values 
      };
    } catch (error) {
      console.error('Error finding name in sheet:', error);
      return { found: false };
    }
  }

  /**
   * Find a specific column value for a user in a spreadsheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} name - The name of the user to search for
   * @param {string} columnName - The name of the column to find (e.g. 'Points2')
   * @param {string} sheetName - Optional sheet name (default: 'Sheet1')
   * @param {string} nameColumn - Optional column to search for the name in (default: 'A')
   * @returns {Promise<{found: boolean, value?: any, row?: number, column?: number}>} - Result object with found status and value
   */
  async findColumnValueForUser(spreadsheetId, name, columnName, sheetName = 'Events', nameColumn = 'A') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return { found: false };
    }

    try {
      // First, find the user in the sheet
      const userResult = await this.findNameInSheet(spreadsheetId, name, sheetName, nameColumn);
      
      if (!userResult.found) {
        return { found: false, message: `User "${name}" not found in the sheet` };
      }

      // Get the header row to find the column index
      const headerRow = userResult.allData[0];
      const columnIndex = headerRow.findIndex(
        header => header && header.toLowerCase().trim() === columnName.toLowerCase().trim()
      );

      if (columnIndex === -1) {
        return { 
          found: false, 
          message: `Column "${columnName}" not found in sheet headers`,
          user: { name, row: userResult.row }
        };
      }

      // Get the value from the user's row at the column index
      const userRow = userResult.rowData;
      const value = columnIndex < userRow.length ? userRow[columnIndex] : null;

      return {
        found: true,
        value: value,
        row: userResult.row,
        column: columnIndex + 1, // 1-indexed column number as used in Sheets
        columnLetter: String.fromCharCode(65 + columnIndex), // Convert to column letter (A, B, C, etc.)
        user: { name, row: userResult.row, rowData: userResult.rowData }
      };
    } catch (error) {
      console.error('Error finding column value for user:', error);
      return { found: false, error: error.message };
    }
  }

  /**
   * Increment a numeric column value for a user in a spreadsheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} name - The name of the user to search for
   * @param {string} columnName - The name of the column to increment (e.g. 'Points2')
   * @param {number} incrementBy - Amount to increment by (default: 1)
   * @param {string} sheetName - Optional sheet name (default: 'Events')
   * @param {string} nameColumn - Optional column to search for the name in (default: 'A')
   * @returns {Promise<{success: boolean, newValue?: number, previousValue?: number, message?: string}>} - Result object with success status and values
   */
  async incrementColumnValueForUser(spreadsheetId, name, columnName, incrementBy = 1, sheetName = 'Events', nameColumn = 'A') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return { success: false, message: 'Failed to initialize Google Sheets API' };
    }

    try {
      // First, find the column value for the user
      const result = await this.findColumnValueForUser(spreadsheetId, name, columnName, sheetName, nameColumn);
      
      if (!result.found) {
        return { 
          success: false, 
          message: result.message || `Failed to find ${columnName} for user ${name}`
        };
      }

      // Get the current value, defaulting to 0 if not present or not a number
      let currentValue = 0;
      if (result.value !== null && result.value !== undefined) {
        // Try to convert the value to a number
        currentValue = Number(result.value);
        if (isNaN(currentValue)) {
          return { 
            success: false, 
            message: `Value '${result.value}' in ${columnName} for user ${name} is not a number`
          };
        }
      }

      // Calculate the new value
      const newValue = currentValue + incrementBy;
      
      // Update the cell with the new value
      const cellAddress = `${sheetName}!${result.columnLetter}${result.row}`;
      const updateSuccess = await this.updateSheetData(
        spreadsheetId,
        cellAddress,
        [[newValue.toString()]]  // Wrap in double array for Google Sheets API format
      );

      if (!updateSuccess) {
        return { 
          success: false, 
          message: `Failed to update ${columnName} for user ${name}`
        };
      }

      return {
        success: true,
        previousValue: currentValue,
        newValue: newValue,
        row: result.row,
        column: result.column,
        columnLetter: result.columnLetter
      };
    } catch (error) {
      console.error('Error incrementing column value for user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear data in a Google Sheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} range - The range to clear (e.g. 'Sheet1!A1:D10')
   * @returns {Promise<boolean>} - Success status
   */
  async clearSheetData(spreadsheetId, range) {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return false;
    }

    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });

      return true;
    } catch (error) {
      console.error('Error clearing sheet data:', error);
      return false;
    }
  }

  /**
   * Get all sheet names in a spreadsheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @returns {Promise<Array<string>>} - Array of sheet names
   */
  async getSheetNames(spreadsheetId) {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return [];
    }

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      return response.data.sheets.map(sheet => sheet.properties.title);
    } catch (error) {
      console.error('Error fetching sheet names:', error);
      return [];
    }
  }

  /**
   * Find and increment a numeric column value for a user across all sheets in a spreadsheet
   * @param {string} spreadsheetId - The ID of the spreadsheet
   * @param {string} name - The name of the user to search for
   * @param {string} columnName - The name of the column to increment (e.g. 'Points2')
   * @param {number} incrementBy - Amount to increment by (default: 1)
   * @param {string} nameColumn - Optional column to search for the name in (default: 'Username')
   * @returns {Promise<{success: boolean, newValue?: number, previousValue?: number, message?: string, sheetName?: string}>} - Result object with success status and values
   */
  async findAndIncrementColumnValueAcrossSheets(spreadsheetId, name, columnName, incrementBy = 1, nameColumn = 'USERNAME') {
    if (!this.initialized) {
      const initSuccess = this.init();
      if (!initSuccess) return { success: false, message: 'Failed to initialize Google Sheets API' };
    }

    try {
      // Get all sheet names in the spreadsheet
      const sheetNames = await this.getSheetNames(spreadsheetId);
      
      if (sheetNames.length === 0) {
        return { 
          success: false, 
          message: 'No sheets found in spreadsheet'
        };
      }

      // Search for the user in each sheet
      for (const sheetName of sheetNames) {
        console.log(`Searching for user ${name} in sheet ${sheetName}...`);
        
        // Attempt to find the user in this sheet
        const userResult = await this.findNameInSheet(spreadsheetId, name, sheetName, nameColumn);
        
        if (userResult.found) {
          console.log(`Found user ${name} in sheet ${sheetName}, row ${userResult.row}`);
          
          // Get the header row to find the column index
          const headerRow = userResult.allData[0];
          const columnIndex = headerRow.findIndex(
            header => header && header.toLowerCase().trim() === columnName.toLowerCase().trim()
          );

          if (columnIndex === -1) {
            console.log(`Column "${columnName}" not found in sheet ${sheetName} headers`);
            continue; // Try the next sheet
          }

          // Get the current value from the user's row at the column index
          const userRow = userResult.rowData;
          const value = columnIndex < userRow.length ? userRow[columnIndex] : null;
          
          // Get the current value, defaulting to 0 if not present or not a number
          let currentValue = 0;
          if (value !== null && value !== undefined) {
            // Try to convert the value to a number
            currentValue = Number(value);
            if (isNaN(currentValue)) {
              console.log(`Value '${value}' in ${columnName} for user ${name} in sheet ${sheetName} is not a number`);
              continue; // Try the next sheet
            }
          }

          // Calculate the new value
          const newValue = currentValue + incrementBy;
          
          // Update the cell with the new value
          const columnLetter = String.fromCharCode(65 + columnIndex);
          const cellAddress = `${sheetName}!${columnLetter}${userResult.row}`;
          
          console.log(`Updating cell ${cellAddress} from ${currentValue} to ${newValue}`);
          
          const updateSuccess = await this.updateSheetData(
            spreadsheetId,
            cellAddress,
            [[newValue.toString()]]  // Wrap in double array for Google Sheets API format
          );

          if (!updateSuccess) {
            return { 
              success: false, 
              message: `Failed to update ${columnName} for user ${name} in sheet ${sheetName}`
            };
          }

          return {
            success: true,
            previousValue: currentValue,
            newValue: newValue,
            row: userResult.row,
            column: columnIndex + 1,
            columnLetter: columnLetter,
            sheetName: sheetName
          };
        }
      }

      // If we get here, the user was not found in any sheet
      return { 
        success: false, 
        message: `User "${name}" not found in any sheet in the spreadsheet`
      };
    } catch (error) {
      console.error('Error finding and incrementing column value across sheets:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new GoogleSheetsApi(); 