/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/snapduel.json`.
 */
export type Snapduel = {
  "address": "33tKSaZpH1fiCZDnMswH5McVW21PYrUF1B9g73wnQBa1",
  "metadata": {
    "name": "snapduel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SnapDuel — On-chain quick-draw betting game on Solana",
    "repository": "https://github.com/sanskritisingh245"
  },
  "instructions": [
    {
      "name": "cancelMatch",
      "docs": [
        "Cancels a match (disconnect / timeout / tie) and restores credits.",
        "",
        "- Returns 2 × WAGER_LAMPORTS from escrow → treasury",
        "- Refunds 1 credit to each player",
        "- Marks escrow as settled (prevents double-cancel)",
        "",
        "Only the backend authority keypair can sign this instruction."
      ],
      "discriminator": [
        142,
        136,
        247,
        45,
        92,
        112,
        180,
        83
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Backend authority keypair"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "matchEscrow",
          "docs": [
            "Match escrow — must not be already settled"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.match_id",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury PDA — receives the returned pot"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "playerOneCredits",
          "docs": [
            "Player one's credit account — receives +1 credit refund"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.player_one",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "playerTwoCredits",
          "docs": [
            "Player two's credit account — receives +1 credit refund"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.player_two",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deductCredit",
      "docs": [
        "Backend deducts 1 credit from each player and creates a match escrow.",
        "",
        "- Atomically decrements both players' play credits by 1",
        "- Creates a new MatchEscrow PDA keyed by `match_id`",
        "- Moves 2 × WAGER_LAMPORTS from treasury → escrow to fund the pot",
        "",
        "Only the backend authority keypair can sign this instruction.",
        "The `init` constraint on match_escrow prevents the same match_id",
        "from being used twice (replay attack prevention)."
      ],
      "discriminator": [
        61,
        215,
        118,
        57,
        3,
        197,
        185,
        196
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Backend authority keypair — must sign every deduct_credit call"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "playerOne"
        },
        {
          "name": "playerTwo"
        },
        {
          "name": "playerOneCredits",
          "docs": [
            "Player one's credit account — must exist and have ≥ 1 play"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "playerOne"
              }
            ]
          }
        },
        {
          "name": "playerTwoCredits",
          "docs": [
            "Player two's credit account — must exist and have ≥ 1 play"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "playerTwo"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury PDA — funds the match escrow"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "matchEscrow",
          "docs": [
            "Match escrow PDA — created fresh for each unique match_id.",
            "`init` means this fails if the account already exists → replay prevention."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "settleMatch",
      "docs": [
        "Settles a completed match: sends pot to winner, rake to treasury.",
        "",
        "- Validates that `winner` is one of the two players in the escrow",
        "- Marks the escrow as settled (replay-proof via `settled` flag + constraint)",
        "- Transfers (pot - rake) lamports from escrow → winner",
        "- Transfers rake lamports from escrow → treasury",
        "- Updates ELO leaderboard for both players",
        "",
        "Only the backend authority keypair can sign this instruction."
      ],
      "discriminator": [
        71,
        124,
        117,
        96,
        191,
        217,
        116,
        24
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Backend authority keypair"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "matchEscrow",
          "docs": [
            "Match escrow — must not be already settled"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.match_id",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury PDA — receives the rake"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "playerOneLeaderboard",
          "docs": [
            "Player one's leaderboard — created if this is their first match"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  100,
                  101,
                  114,
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.player_one",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "playerTwoLeaderboard",
          "docs": [
            "Player two's leaderboard — created if this is their first match"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  97,
                  100,
                  101,
                  114,
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_escrow.player_two",
                "account": "matchEscrow"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "winner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "topUp",
      "docs": [
        "Player deposits SOL into the treasury and receives 5 play credits.",
        "",
        "This is the ONLY instruction that players sign directly from their wallet.",
        "All other instructions are signed by the backend authority keypair.",
        "",
        "Accounts: player (signer + payer), treasury PDA, player_credits PDA"
      ],
      "discriminator": [
        236,
        225,
        96,
        9,
        60,
        106,
        77,
        208
      ],
      "accounts": [
        {
          "name": "player",
          "docs": [
            "Player wallet — signs the transaction and pays for rent"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury PDA — program-controlled SOL vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "playerCredits",
          "docs": [
            "Player's credit account — created on first top-up, updated on subsequent ones"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  100,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "leaderboard",
      "discriminator": [
        247,
        186,
        238,
        243,
        194,
        30,
        9,
        36
      ]
    },
    {
      "name": "matchEscrow",
      "discriminator": [
        41,
        253,
        245,
        149,
        7,
        243,
        203,
        139
      ]
    },
    {
      "name": "playerCredits",
      "discriminator": [
        136,
        27,
        81,
        189,
        32,
        49,
        207,
        235
      ]
    }
  ],
  "events": [
    {
      "name": "matchCancelledEvent",
      "discriminator": [
        229,
        189,
        48,
        183,
        219,
        47,
        20,
        37
      ]
    },
    {
      "name": "matchCreatedEvent",
      "discriminator": [
        101,
        99,
        74,
        54,
        121,
        190,
        111,
        238
      ]
    },
    {
      "name": "matchSettledEvent",
      "discriminator": [
        56,
        219,
        213,
        131,
        79,
        126,
        13,
        227
      ]
    },
    {
      "name": "topUpEvent",
      "discriminator": [
        232,
        199,
        164,
        60,
        119,
        195,
        17,
        183
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "insufficientCredits",
      "msg": "Insufficient play credits — top up to get more plays"
    },
    {
      "code": 6001,
      "name": "matchAlreadySettled",
      "msg": "Match has already been settled"
    },
    {
      "code": 6002,
      "name": "invalidWinner",
      "msg": "Invalid winner — must be player_one or player_two from the escrow"
    },
    {
      "code": 6003,
      "name": "samePlayer",
      "msg": "Both players must be different wallets"
    },
    {
      "code": 6004,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "leaderboard",
      "docs": [
        "Per-player win/loss record and ELO rating.",
        "PDA seeds: [\"leaderboard\", player_pubkey]",
        "Space: 8 + 32 + 4 + 4 + 2 + 1 = 51 bytes"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "losses",
            "type": "u32"
          },
          {
            "name": "elo",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "matchCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "playerOne",
            "type": "pubkey"
          },
          {
            "name": "playerTwo",
            "type": "pubkey"
          },
          {
            "name": "wagerLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "matchEscrow",
      "docs": [
        "Holds escrowed SOL for a single match.",
        "PDA seeds: [\"escrow\", match_id_bytes]",
        "Space: 8 + 16 + 32 + 32 + 8 + 1 + 32 + 8 + 1 = 138 bytes"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "playerOne",
            "type": "pubkey"
          },
          {
            "name": "playerTwo",
            "type": "pubkey"
          },
          {
            "name": "wagerLamports",
            "type": "u64"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchSettledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "rake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerCredits",
      "docs": [
        "Tracks a player's remaining plays and lifetime top-up count.",
        "PDA seeds: [\"credits\", player_pubkey]",
        "Space: 8 (discriminator) + 32 + 1 + 8 + 1 = 50 bytes"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "playsRemaining",
            "type": "u8"
          },
          {
            "name": "totalToppedUp",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "topUpEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "costLamports",
            "type": "u64"
          },
          {
            "name": "playsRemaining",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
