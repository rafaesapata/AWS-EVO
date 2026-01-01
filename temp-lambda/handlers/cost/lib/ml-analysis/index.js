"use strict";
/**
 * ML Analysis Module
 *
 * Exports all ML analysis functions for waste detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceFromResourceType = exports.getConsoleUrlFromArn = exports.parseArn = exports.buildResourceArn = exports.getImplementationComplexity = exports.generateUtilizationPatterns = exports.calculateAutoScalingConfig = exports.classifyWaste = exports.analyzeUtilization = void 0;
var waste_analyzer_js_1 = require("./waste-analyzer.js");
Object.defineProperty(exports, "analyzeUtilization", { enumerable: true, get: function () { return waste_analyzer_js_1.analyzeUtilization; } });
Object.defineProperty(exports, "classifyWaste", { enumerable: true, get: function () { return waste_analyzer_js_1.classifyWaste; } });
Object.defineProperty(exports, "calculateAutoScalingConfig", { enumerable: true, get: function () { return waste_analyzer_js_1.calculateAutoScalingConfig; } });
Object.defineProperty(exports, "generateUtilizationPatterns", { enumerable: true, get: function () { return waste_analyzer_js_1.generateUtilizationPatterns; } });
Object.defineProperty(exports, "getImplementationComplexity", { enumerable: true, get: function () { return waste_analyzer_js_1.getImplementationComplexity; } });
var arn_builder_js_1 = require("./arn-builder.js");
Object.defineProperty(exports, "buildResourceArn", { enumerable: true, get: function () { return arn_builder_js_1.buildResourceArn; } });
Object.defineProperty(exports, "parseArn", { enumerable: true, get: function () { return arn_builder_js_1.parseArn; } });
Object.defineProperty(exports, "getConsoleUrlFromArn", { enumerable: true, get: function () { return arn_builder_js_1.getConsoleUrlFromArn; } });
Object.defineProperty(exports, "getServiceFromResourceType", { enumerable: true, get: function () { return arn_builder_js_1.getServiceFromResourceType; } });
//# sourceMappingURL=index.js.map