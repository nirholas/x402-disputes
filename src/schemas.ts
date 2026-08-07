/**
 * Per-route request/response schemas published in the x402 402 challenge.
 *
 * Generated from `openapi.json` so the discovery metadata and the runtime
 * challenge cannot drift apart: `accepts[].outputSchema.input` describes how to
 * call the route, `accepts[].outputSchema.output` describes what the paid 200
 * returns. Keys match the paywall route map in `server.ts` exactly.
 *
 * Update `openapi.json` first, then re-derive this file.
 */

/** x402 Bazaar-style schema pair carried by every accept entry. */
export type RouteSchema = {
  /** How to invoke the route: method, query params and/or JSON body fields. */
  input: Record<string, unknown>;
  /** JSON Schema of the paid 200 response body. */
  output: Record<string, unknown>;
};

export const ROUTE_SCHEMAS: Record<string, RouteSchema> = {
  "POST /cases": {
    "input": {
      "type": "http",
      "method": "POST",
      "bodyType": "json",
      "bodyFields": {
        "claimant": {
          "type": "string"
        },
        "respondent": {
          "type": "object",
          "required": [
            "merchantId"
          ],
          "properties": {
            "merchantId": {
              "type": "string"
            },
            "wallet": {
              "type": "string"
            }
          }
        },
        "disputedPayment": {
          "type": "object",
          "required": [
            "transaction"
          ],
          "properties": {
            "transaction": {
              "type": "string"
            },
            "network": {
              "type": "string"
            },
            "amount": {
              "type": "string"
            }
          }
        },
        "claimType": {
          "type": "string",
          "enum": [
            "not_delivered",
            "partial",
            "wrong_item",
            "late",
            "overcharged"
          ]
        },
        "statement": {
          "type": "string",
          "maxLength": 2000
        },
        "requestedRemedy": {
          "type": "string",
          "enum": [
            "full_refund",
            "partial_refund",
            "redo",
            "none"
          ]
        },
        "evidence": {
          "type": "array",
          "maxItems": 12,
          "items": {
            "type": "object",
            "properties": {
              "label": {
                "type": "string"
              },
              "content": {
                "type": "string"
              },
              "sha256": {
                "type": "string",
                "pattern": "^[0-9a-f]{64}$"
              },
              "bytes": {
                "type": "integer"
              }
            }
          }
        }
      },
      "bodyFieldsRequired": [
        "claimant",
        "respondent",
        "disputedPayment"
      ]
    },
    "output": {
      "type": "object",
      "properties": {
        "caseId": {
          "type": "string"
        },
        "document": {
          "const": "x402-disputes/case"
        },
        "claimant": {
          "type": "object",
          "description": "Dual-rail wallet identity",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana"
              ]
            },
            "address": {
              "type": "string",
              "description": "Lowercased 0x address, or base58 Solana pubkey"
            }
          }
        },
        "respondent": {
          "type": "object",
          "properties": {
            "merchantId": {
              "type": "string"
            },
            "wallet": {
              "type": "object",
              "description": "Dual-rail wallet identity",
              "properties": {
                "rail": {
                  "type": "string",
                  "enum": [
                    "evm",
                    "solana"
                  ]
                },
                "address": {
                  "type": "string",
                  "description": "Lowercased 0x address, or base58 Solana pubkey"
                }
              }
            }
          }
        },
        "disputedPayment": {
          "type": "object",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana",
                "unknown"
              ]
            },
            "network": {
              "type": "string"
            },
            "transaction": {
              "type": "string"
            },
            "amount": {
              "type": "string"
            }
          }
        },
        "claimType": {
          "type": "string"
        },
        "statement": {
          "type": "string"
        },
        "requestedRemedy": {
          "type": "string"
        },
        "evidence": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "label": {
                "type": "string"
              },
              "sha256": {
                "type": "string"
              },
              "bytes": {
                "type": "integer"
              }
            }
          }
        },
        "evidenceRoot": {
          "type": "string",
          "description": "SHA-256 over the sorted item hashes"
        },
        "filingFee": {
          "type": "string"
        },
        "openedAt": {
          "type": "string",
          "format": "date-time"
        },
        "respondBy": {
          "type": "string",
          "format": "date-time"
        },
        "status": {
          "type": "string",
          "enum": [
            "open",
            "awaiting_response",
            "ruled",
            "withdrawn"
          ]
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "const": "HMAC-SHA256"
        }
      }
    }
  },
  "GET /cases/:id": {
    "input": {
      "type": "http",
      "method": "GET",
      "pathParams": {
        "id": {
          "type": "string",
          "description": "The caseId from `POST /cases`"
        }
      },
      "queryParams": {}
    },
    "output": {
      "type": "object",
      "properties": {
        "caseId": {
          "type": "string"
        },
        "document": {
          "const": "x402-disputes/status"
        },
        "status": {
          "type": "string",
          "enum": [
            "open",
            "awaiting_response",
            "ruled",
            "withdrawn"
          ]
        },
        "claimType": {
          "type": "string"
        },
        "claimant": {
          "type": "object",
          "description": "Dual-rail wallet identity",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana"
              ]
            },
            "address": {
              "type": "string",
              "description": "Lowercased 0x address, or base58 Solana pubkey"
            }
          }
        },
        "respondent": {
          "type": "object"
        },
        "disputedPayment": {
          "type": "object",
          "properties": {
            "rail": {
              "type": "string",
              "enum": [
                "evm",
                "solana",
                "unknown"
              ]
            },
            "network": {
              "type": "string"
            },
            "transaction": {
              "type": "string"
            },
            "amount": {
              "type": "string"
            }
          }
        },
        "requestedRemedy": {
          "type": "string"
        },
        "evidenceRoot": {
          "type": "string"
        },
        "evidenceCount": {
          "type": "integer"
        },
        "openedAt": {
          "type": "string",
          "format": "date-time"
        },
        "respondBy": {
          "type": "string",
          "format": "date-time"
        },
        "overdue": {
          "type": "boolean"
        },
        "timeline": {
          "type": "array",
          "items": {
            "type": "object"
          }
        },
        "ruling": {
          "type": [
            "object",
            "null"
          ],
          "description": "The signed ruling, once one exists"
        },
        "snapshotAt": {
          "type": "string",
          "format": "date-time"
        },
        "signature": {
          "type": "string"
        },
        "algorithm": {
          "const": "HMAC-SHA256"
        }
      }
    }
  },
};
