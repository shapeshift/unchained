/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { Controller, ValidationService, FieldErrors, ValidateError, TsoaRoute, HttpStatusCodeLiteral, TsoaResponse } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { Blockbook } from './controller';
import * as express from 'express';

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "BlockbookInfo": {
        "dataType": "refObject",
        "properties": {
            "coin": {"dataType":"string","required":true},
            "host": {"dataType":"string","required":true},
            "version": {"dataType":"string","required":true},
            "gitCommit": {"dataType":"string","required":true},
            "buildTime": {"dataType":"string","required":true},
            "syncMode": {"dataType":"boolean","required":true},
            "initialSync": {"dataType":"boolean","required":true},
            "inSync": {"dataType":"boolean","required":true},
            "bestHeight": {"dataType":"double","required":true},
            "lastBlockTime": {"dataType":"string","required":true},
            "inSyncMempool": {"dataType":"boolean","required":true},
            "lastMempoolTime": {"dataType":"string","required":true},
            "mempoolSize": {"dataType":"double","required":true},
            "decimals": {"dataType":"double","required":true},
            "dbSize": {"dataType":"double","required":true},
            "dbSizeFromColumns": {"dataType":"double"},
            "dbColumns": {"dataType":"array","array":{"dataType":"any"}},
            "about": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BackendInfo": {
        "dataType": "refObject",
        "properties": {
            "error": {"dataType":"string"},
            "chain": {"dataType":"string"},
            "blocks": {"dataType":"double"},
            "headers": {"dataType":"double"},
            "bestBlockHash": {"dataType":"string"},
            "difficulty": {"dataType":"string"},
            "sizeOnDisk": {"dataType":"double"},
            "version": {"dataType":"string"},
            "subversion": {"dataType":"string"},
            "protocolVersion": {"dataType":"string"},
            "timeOffset": {"dataType":"double"},
            "warnings": {"dataType":"string"},
            "consensus": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Info": {
        "dataType": "refObject",
        "properties": {
            "blockbook": {"ref":"BlockbookInfo","required":true},
            "backend": {"ref":"BackendInfo","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BlockIndex": {
        "dataType": "refObject",
        "properties": {
            "hash": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Vin": {
        "dataType": "refObject",
        "properties": {
            "txid": {"dataType":"string"},
            "vout": {"dataType":"double"},
            "sequence": {"dataType":"double"},
            "n": {"dataType":"double","required":true},
            "addresses": {"dataType":"array","array":{"dataType":"string"}},
            "isAddress": {"dataType":"boolean","required":true},
            "value": {"dataType":"string"},
            "hex": {"dataType":"string"},
            "asm": {"dataType":"string"},
            "coinbase": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Vout": {
        "dataType": "refObject",
        "properties": {
            "value": {"dataType":"string"},
            "n": {"dataType":"double","required":true},
            "spent": {"dataType":"boolean"},
            "spentTxId": {"dataType":"string"},
            "spentIndex": {"dataType":"double"},
            "spentHeight": {"dataType":"double"},
            "hex": {"dataType":"string"},
            "asm": {"dataType":"string"},
            "addresses": {"dataType":"union","subSchemas":[{"dataType":"array","array":{"dataType":"string"}},{"dataType":"enum","enums":[null]}],"required":true},
            "isAddress": {"dataType":"boolean","required":true},
            "type": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TokenTransfer": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "from": {"dataType":"string","required":true},
            "to": {"dataType":"string","required":true},
            "token": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "symbol": {"dataType":"string","required":true},
            "decimals": {"dataType":"double","required":true},
            "value": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EthereumSpecific": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"double","required":true},
            "nonce": {"dataType":"double","required":true},
            "gasLimit": {"dataType":"double","required":true},
            "gasUsed": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "gasPrice": {"dataType":"string","required":true},
            "data": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Tx": {
        "dataType": "refObject",
        "properties": {
            "txid": {"dataType":"string","required":true},
            "version": {"dataType":"double"},
            "lockTime": {"dataType":"double"},
            "vin": {"dataType":"array","array":{"ref":"Vin"},"required":true},
            "vout": {"dataType":"array","array":{"ref":"Vout"},"required":true},
            "blockHash": {"dataType":"string"},
            "blockHeight": {"dataType":"double","required":true},
            "confirmations": {"dataType":"double","required":true},
            "blockTime": {"dataType":"double","required":true},
            "size": {"dataType":"double"},
            "value": {"dataType":"string","required":true},
            "valueIn": {"dataType":"string"},
            "fees": {"dataType":"string"},
            "hex": {"dataType":"string"},
            "rbf": {"dataType":"boolean"},
            "tokenTransfers": {"dataType":"array","array":{"ref":"TokenTransfer"}},
            "coinSpecificData": {"dataType":"any"},
            "ethereumSpecific": {"ref":"EthereumSpecific"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EthTxSpecific": {
        "dataType": "refObject",
        "properties": {
            "tx": {"dataType":"nestedObjectLiteral","nestedProperties":{"transactionIndex":{"dataType":"string","required":true},"from":{"dataType":"string","required":true},"blockHash":{"dataType":"string"},"blockNumber":{"dataType":"string","required":true},"hash":{"dataType":"string","required":true},"input":{"dataType":"string","required":true},"value":{"dataType":"string","required":true},"to":{"dataType":"string","required":true},"gas":{"dataType":"string","required":true},"gasPrice":{"dataType":"string","required":true},"nonce":{"dataType":"string","required":true}},"required":true},
            "receipt": {"dataType":"nestedObjectLiteral","nestedProperties":{"logs":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"data":{"dataType":"string","required":true},"topics":{"dataType":"array","array":{"dataType":"string"},"required":true},"address":{"dataType":"string","required":true}}},"required":true},"status":{"dataType":"string","required":true},"gasUsed":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TxSpecific": {
        "dataType": "refAlias",
        "type": {"ref":"EthTxSpecific","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Token": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "path": {"dataType":"string"},
            "contract": {"dataType":"string"},
            "transfers": {"dataType":"double","required":true},
            "symbol": {"dataType":"string"},
            "decimals": {"dataType":"double"},
            "balance": {"dataType":"string"},
            "totalReceived": {"dataType":"string"},
            "totalSent": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Erc20Contract": {
        "dataType": "refObject",
        "properties": {
            "contract": {"dataType":"string","required":true},
            "name": {"dataType":"string","required":true},
            "symbol": {"dataType":"string","required":true},
            "decimals": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Address": {
        "dataType": "refObject",
        "properties": {
            "page": {"dataType":"double"},
            "totalPages": {"dataType":"double"},
            "itemsOnPage": {"dataType":"double"},
            "address": {"dataType":"string","required":true},
            "balance": {"dataType":"string","required":true},
            "totalReceived": {"dataType":"string"},
            "totalSent": {"dataType":"string"},
            "unconfirmedBalance": {"dataType":"string","required":true},
            "unconfirmedTxs": {"dataType":"double","required":true},
            "txs": {"dataType":"double","required":true},
            "nonTokenTxs": {"dataType":"double"},
            "transactions": {"dataType":"array","array":{"ref":"Tx"}},
            "txids": {"dataType":"array","array":{"dataType":"string"}},
            "nonce": {"dataType":"string"},
            "usedTokens": {"dataType":"double"},
            "tokens": {"dataType":"array","array":{"ref":"Token"}},
            "erc20Contract": {"ref":"Erc20Contract"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Xpub": {
        "dataType": "refAlias",
        "type": {"ref":"Address","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Utxo": {
        "dataType": "refObject",
        "properties": {
            "txid": {"dataType":"string","required":true},
            "vout": {"dataType":"double","required":true},
            "value": {"dataType":"string","required":true},
            "height": {"dataType":"double"},
            "confirmations": {"dataType":"double","required":true},
            "address": {"dataType":"string"},
            "path": {"dataType":"string"},
            "locktime": {"dataType":"double"},
            "coinbase": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Block": {
        "dataType": "refObject",
        "properties": {
            "page": {"dataType":"double"},
            "totalPages": {"dataType":"double"},
            "itemsOnPage": {"dataType":"double"},
            "hash": {"dataType":"string","required":true},
            "previousBlockHash": {"dataType":"string"},
            "nextBlockHash": {"dataType":"string"},
            "height": {"dataType":"double","required":true},
            "confirmations": {"dataType":"double","required":true},
            "size": {"dataType":"double","required":true},
            "time": {"dataType":"double"},
            "version": {"dataType":"double","required":true},
            "merkleRoot": {"dataType":"string","required":true},
            "nonce": {"dataType":"string","required":true},
            "bits": {"dataType":"string","required":true},
            "difficulty": {"dataType":"string","required":true},
            "txCount": {"dataType":"double","required":true},
            "tx": {"dataType":"array","array":{"dataType":"string"}},
            "txs": {"dataType":"array","array":{"ref":"Tx"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SendTx": {
        "dataType": "refObject",
        "properties": {
            "result": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "BalanceHistory": {
        "dataType": "refObject",
        "properties": {
            "time": {"dataType":"double","required":true},
            "txs": {"dataType":"double","required":true},
            "received": {"dataType":"string","required":true},
            "sent": {"dataType":"string","required":true},
            "sentToSelf": {"dataType":"string","required":true},
            "rates": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"double"}},
            "txid": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const validationService = new ValidationService(models);

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

export function RegisterRoutes(app: express.Router) {
    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################
        app.get('/api/v2',
            function Blockbook_getInfo(request: any, response: any, next: any) {
            const args = {
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getInfo.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/block-index/:height',
            function Blockbook_getBlockHash(request: any, response: any, next: any) {
            const args = {
                    height: {"in":"path","name":"height","required":true,"dataType":"double"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getBlockHash.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/tx/:txid',
            function Blockbook_getTransaction(request: any, response: any, next: any) {
            const args = {
                    txid: {"in":"path","name":"txid","required":true,"dataType":"string"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getTransaction.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/tx-specific/:txid',
            function Blockbook_getTransactionSpecific(request: any, response: any, next: any) {
            const args = {
                    txid: {"in":"path","name":"txid","required":true,"dataType":"string"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getTransactionSpecific.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/address/:address',
            function Blockbook_getAddress(request: any, response: any, next: any) {
            const args = {
                    address: {"in":"path","name":"address","required":true,"dataType":"string"},
                    page: {"in":"query","name":"page","dataType":"double"},
                    pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                    from: {"in":"query","name":"from","dataType":"double"},
                    to: {"in":"query","name":"to","dataType":"double"},
                    details: {"in":"query","name":"details","dataType":"union","subSchemas":[{"dataType":"enum","enums":["basic"]},{"dataType":"enum","enums":["tokens"]},{"dataType":"enum","enums":["tokenBalances"]},{"dataType":"enum","enums":["txids"]},{"dataType":"enum","enums":["txslight"]},{"dataType":"enum","enums":["txs"]}]},
                    contract: {"in":"query","name":"contract","dataType":"string"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getAddress.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/xpub/:xpub',
            function Blockbook_getXpub(request: any, response: any, next: any) {
            const args = {
                    xpub: {"in":"path","name":"xpub","required":true,"dataType":"string"},
                    page: {"in":"query","name":"page","dataType":"double"},
                    pageSize: {"in":"query","name":"pageSize","dataType":"double"},
                    from: {"in":"query","name":"from","dataType":"double"},
                    to: {"in":"query","name":"to","dataType":"double"},
                    details: {"in":"query","name":"details","dataType":"union","subSchemas":[{"dataType":"enum","enums":["basic"]},{"dataType":"enum","enums":["tokens"]},{"dataType":"enum","enums":["tokenBalances"]},{"dataType":"enum","enums":["txids"]},{"dataType":"enum","enums":["txs"]}]},
                    tokens: {"in":"query","name":"tokens","dataType":"union","subSchemas":[{"dataType":"enum","enums":["nonzero"]},{"dataType":"enum","enums":["used"]},{"dataType":"enum","enums":["derived"]}]},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getXpub.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/utxo/:account',
            function Blockbook_getUtxo(request: any, response: any, next: any) {
            const args = {
                    account: {"in":"path","name":"account","required":true,"dataType":"string"},
                    confirmed: {"in":"query","name":"confirmed","dataType":"boolean"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getUtxo.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/block/:block',
            function Blockbook_getBlock(request: any, response: any, next: any) {
            const args = {
                    block: {"in":"path","name":"block","required":true,"dataType":"string"},
                    page: {"in":"query","name":"page","dataType":"double"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.getBlock.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/sendtx/:hex',
            function Blockbook_sendTransaction(request: any, response: any, next: any) {
            const args = {
                    hex: {"in":"path","name":"hex","required":true,"dataType":"string"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.sendTransaction.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        app.get('/api/v2/balancehistory/:account',
            function Blockbook_balanceHistory(request: any, response: any, next: any) {
            const args = {
                    account: {"in":"path","name":"account","required":true,"dataType":"string"},
                    from: {"in":"query","name":"from","dataType":"double"},
                    to: {"in":"query","name":"to","dataType":"double"},
                    fiatcurrency: {"in":"query","name":"fiatcurrency","dataType":"string"},
                    groupBy: {"in":"query","name":"groupBy","dataType":"double"},
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);
            } catch (err) {
                return next(err);
            }

            const controller = new Blockbook();


            const promise = controller.balanceHistory.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, undefined, next);
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function isController(object: any): object is Controller {
        return 'getHeaders' in object && 'getStatus' in object && 'setStatus' in object;
    }

    function promiseHandler(controllerObj: any, promise: any, response: any, successStatus: any, next: any) {
        return Promise.resolve(promise)
            .then((data: any) => {
                let statusCode = successStatus;
                let headers;
                if (isController(controllerObj)) {
                    headers = controllerObj.getHeaders();
                    statusCode = controllerObj.getStatus() || statusCode;
                }

                // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                returnHandler(response, statusCode, data, headers)
            })
            .catch((error: any) => next(error));
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function returnHandler(response: any, statusCode?: number, data?: any, headers: any = {}) {
        if (response.headersSent) {
            return;
        }
        Object.keys(headers).forEach((name: string) => {
            response.set(name, headers[name]);
        });
        if (data && typeof data.pipe === 'function' && data.readable && typeof data._read === 'function') {
            data.pipe(response);
        } else if (data !== null && data !== undefined) {
            response.status(statusCode || 200).json(data);
        } else {
            response.status(statusCode || 204).end();
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function responder(response: any): TsoaResponse<HttpStatusCodeLiteral, unknown>  {
        return function(status, data, headers) {
            returnHandler(response, status, data, headers);
        };
    };

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function getValidatedArgs(args: any, request: any, response: any): any[] {
        const fieldErrors: FieldErrors  = {};
        const values = Object.keys(args).map((key) => {
            const name = args[key].name;
            switch (args[key].in) {
                case 'request':
                    return request;
                case 'query':
                    return validationService.ValidateParam(args[key], request.query[name], name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                case 'path':
                    return validationService.ValidateParam(args[key], request.params[name], name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                case 'header':
                    return validationService.ValidateParam(args[key], request.header(name), name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                case 'body':
                    return validationService.ValidateParam(args[key], request.body, name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                case 'body-prop':
                    return validationService.ValidateParam(args[key], request.body[name], name, fieldErrors, 'body.', {"noImplicitAdditionalProperties":"throw-on-extras"});
                case 'formData':
                    if (args[key].dataType === 'file') {
                        return validationService.ValidateParam(args[key], request.file, name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                    } else if (args[key].dataType === 'array' && args[key].array.dataType === 'file') {
                        return validationService.ValidateParam(args[key], request.files, name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                    } else {
                        return validationService.ValidateParam(args[key], request.body[name], name, fieldErrors, undefined, {"noImplicitAdditionalProperties":"throw-on-extras"});
                    }
                case 'res':
                    return responder(response);
            }
        });

        if (Object.keys(fieldErrors).length > 0) {
            throw new ValidateError(fieldErrors, '');
        }
        return values;
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
