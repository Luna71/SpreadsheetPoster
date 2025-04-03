# SpreadsheetRanker API Documentation

This API allows you to update user fields in Google Spreadsheets across different departments.

## Authentication

All API requests (except the root endpoint) require authentication using an API token.

### Generating an API Token

Run the included script to generate a secure random token:

```bash
node generate-token.js
```

This will output a token that you should add to your `.env` file:

```
API_TOKEN=your_generated_token
```

### Using the API Token

You can provide the API token in one of two ways:

1. **Bearer Token in Authorization Header (Recommended)**

```
Authorization: Bearer your_api_token
```

2. **Query Parameter**

```
?api_token=your_api_token
```

## API Endpoints

### GET /

Check if the API is running.

**Response:**

```json
{
  "message": "SpreadsheetRanker API is running"
}
```

### POST /update-fields

Update field values for multiple users across different departments.

**Authentication Required:** Yes

**Request Body:**

```json
[
  {
    "name": "username",
    "department": "department_code",
    "field": "field_name",
    "increment": 1
  },
  {
    "name": "another_user",
    "department": "department_code",
    "field": "another_field",
    "increment": 2
  }
]
```

Parameters:
- `name`: (Required) The username to search for in the spreadsheet
- `department`: (Required) Department code that maps to a specific spreadsheet ID
- `field`: (Required) The column name to increment
- `increment`: (Optional) The amount to increment by (defaults to 1 if not specified)

**Success Response:**

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "previousValue": 5,
      "newValue": 6,
      "row": 3,
      "column": 5,
      "columnLetter": "E",
      "name": "username",
      "department": "department_code",
      "field": "field_name",
      "increment": 1
    },
    {
      "success": true,
      "previousValue": 10,
      "newValue": 12,
      "row": 4,
      "column": 6,
      "columnLetter": "F",
      "name": "another_user",
      "department": "department_code",
      "field": "another_field",
      "increment": 2
    }
  ]
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message"
}
```

## Example Usage

### Using cURL

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_token" \
  -d '[{"name":"zalh","department":"FMB","field":"Points1","increment":1}]' \
  http://localhost:3000/update-fields
```

### Using JavaScript Fetch

```javascript
const response = await fetch('http://localhost:3000/update-fields', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_api_token'
  },
  body: JSON.stringify([
    {
      name: 'zalh',
      department: 'FMB',
      field: 'Points1',
      increment: 1
    }
  ])
});

const data = await response.json();
console.log(data);
``` 