"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.ProcessingStatus = exports.SectionType = exports.EducationLevel = void 0;
exports.createApiError = createApiError;
exports.generateId = generateId;
// Education levels supported by the application
var EducationLevel;
(function (EducationLevel) {
    EducationLevel["HIGH_SCHOOL"] = "high_school";
    EducationLevel["UNDERGRADUATE"] = "undergraduate";
    EducationLevel["MASTERS"] = "masters";
    EducationLevel["PHD"] = "phd";
    EducationLevel["NO_TECHNICAL"] = "no_technical";
})(EducationLevel || (exports.EducationLevel = EducationLevel = {}));
var SectionType;
(function (SectionType) {
    SectionType["TITLE"] = "title";
    SectionType["ABSTRACT"] = "abstract";
    SectionType["INTRODUCTION"] = "introduction";
    SectionType["METHODOLOGY"] = "methodology";
    SectionType["RESULTS"] = "results";
    SectionType["DISCUSSION"] = "discussion";
    SectionType["CONCLUSION"] = "conclusion";
    SectionType["REFERENCES"] = "references";
    SectionType["APPENDIX"] = "appendix";
    SectionType["FIGURE"] = "figure";
    SectionType["TABLE"] = "table";
    SectionType["CAPTION"] = "caption";
    SectionType["OTHER"] = "other";
})(SectionType || (exports.SectionType = SectionType = {}));
var ProcessingStatus;
(function (ProcessingStatus) {
    ProcessingStatus["PENDING"] = "pending";
    ProcessingStatus["PROCESSING"] = "processing";
    ProcessingStatus["COMPLETED"] = "completed";
    ProcessingStatus["FAILED"] = "failed";
})(ProcessingStatus || (exports.ProcessingStatus = ProcessingStatus = {}));
// Error handling
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["DOCUMENT_NOT_FOUND"] = "DOCUMENT_NOT_FOUND";
    ErrorCode["PROCESSING_FAILED"] = "PROCESSING_FAILED";
    ErrorCode["INTERNAL_SERVER_ERROR"] = "INTERNAL_SERVER_ERROR";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
// Utility function to create API errors
function createApiError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
}
// Utility function to generate unique IDs
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
