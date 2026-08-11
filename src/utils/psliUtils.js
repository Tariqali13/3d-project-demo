// PHASE 2.02: Utility functions for PSLI file handling

/**
 * Checks if a file is a PSLI file
 * @param {string} fileName - The name of the file
 * @returns {boolean} - True if the file is a PSLI file
 */
export function isPsliFile(fileName) {
    if (!fileName) return false
    return fileName.toLowerCase().endsWith(".psli")
}

/**
 * Extracts the base name from a PSLI file name
 * @param {string} fileName - The name of the PSLI file
 * @returns {string} - The base name without extension
 */
export function getPsliBaseName(fileName) {
    if (!fileName) return ""
    return fileName.replace(/\.psli$/i, "")
}

/**
 * Creates a debug function for PSLI processing
 * @param {boolean} enabled - Whether debugging is enabled
 * @returns {Function} - A debug function
 */
export function createPsliDebugger(enabled = false) {
    return function debug(...args) {
        if (enabled) {
            console.log("[PSLI Debug]", ...args)
        }
    }
}

/**
 * Validates PSLI data structure
 * @param {Object} psliData - The PSLI data object
 * @returns {boolean} - True if the data is valid
 */
export function validatePsliData(psliData) {
    if (!psliData) return false

    // Check for required properties
    const hasJpgFile = psliData.jpgFile && psliData.jpgFile.data
    const hasJgwValues = psliData.jgwValues && psliData.jgwValues.parsed

    return hasJpgFile && hasJgwValues
}

/**
 * Extracts elevation from PSLI data
 * @param {Object} psliData - The PSLI data object
 * @param {number} defaultElevation - Default elevation to use if not found
 * @returns {number} - The elevation value
 */
export function getPsliElevation(psliData, defaultElevation = 0) {
    if (!psliData) return defaultElevation

    // If elevation is explicitly provided, use it
    if (typeof psliData.elevation === "number") {
        return psliData.elevation
    }

    // Otherwise return default
    return defaultElevation
}

/**
 * Creates a test function to verify PSLI image loading
 * @param {string} base64Image - Base64 encoded image data
 * @returns {Promise<boolean>} - Promise resolving to true if image loads successfully
 */
export function testPsliImageLoading(base64Image) {
    return new Promise((resolve) => {
        if (!base64Image) {
            resolve(false)
            return
        }

        const img = new Image()
        img.onload = () => {
            resolve(true)
        }
        img.onerror = () => {
            resolve(false)
        }
        img.src = base64Image
    })
}
