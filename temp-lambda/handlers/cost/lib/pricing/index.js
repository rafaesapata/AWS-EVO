"use strict";
/**
 * Pricing module exports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPriceCache = exports.getPriceCacheStats = exports.getEIPPrice = exports.getNATGatewayPrice = exports.getEBSPrice = exports.getDynamoDBPrice = exports.getS3Price = exports.getLambdaPrice = exports.getRDSPrice = exports.getEC2Price = void 0;
var dynamic_pricing_service_js_1 = require("./dynamic-pricing-service.js");
Object.defineProperty(exports, "getEC2Price", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getEC2Price; } });
Object.defineProperty(exports, "getRDSPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getRDSPrice; } });
Object.defineProperty(exports, "getLambdaPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getLambdaPrice; } });
Object.defineProperty(exports, "getS3Price", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getS3Price; } });
Object.defineProperty(exports, "getDynamoDBPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getDynamoDBPrice; } });
Object.defineProperty(exports, "getEBSPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getEBSPrice; } });
Object.defineProperty(exports, "getNATGatewayPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getNATGatewayPrice; } });
Object.defineProperty(exports, "getEIPPrice", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getEIPPrice; } });
Object.defineProperty(exports, "getPriceCacheStats", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.getPriceCacheStats; } });
Object.defineProperty(exports, "clearPriceCache", { enumerable: true, get: function () { return dynamic_pricing_service_js_1.clearPriceCache; } });
//# sourceMappingURL=index.js.map