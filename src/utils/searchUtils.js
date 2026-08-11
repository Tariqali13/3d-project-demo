// searchUtils.js
/**
 * Recursively searches for a value by key in a deeply nested object or array.
 * If `returnObject` is true, returns the entire object containing the key.
 * @param {Object|Array} data - The data structure to search through.
 * @param {string} targetKey - The key to search for.
 * @param {boolean} returnObject - Whether to return the entire object containing the key.
 * @returns {Array} - An array of matching values or objects containing the key.
 */
export function findDeepValue(
  data,
  targetKey,
  targetVal,
  returnObject = false
) {
  let results = [];

  function search(obj) {
    if (Array.isArray(obj)) {
      obj.forEach((item) => search(item));
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        if (key === targetKey && value == targetVal) {
          results.push(returnObject ? obj : value);
        }
        search(value); // Continue searching deeper
      });
    }
  }

  search(data);
  return results;
}

export const fetchObjectsByKey = (data, keyToFind, results = []) => {
  // Check if the data itself is an array
  if (Array.isArray(data)) {
    data.forEach((item) => fetchObjectsByKey(item, keyToFind, results));
  }
  // If the data is an object, check for the key and recurse
  else if (typeof data === 'object' && data !== null) {
    if (keyToFind in data) {
      results.push(data); // If the key exists in the current object, add it to results
    }
    // Recursively check each property in the object
    for (const key in data) {
      fetchObjectsByKey(data[key], keyToFind, results);
    }
  }
  return results;
};

export function fetchObjectsByKeyWithCondition(data, keyToFind, results = []) {
  // 1) If `data` is an array, recurse on each item
  if (Array.isArray(data)) {
    data.forEach((item) => {
      fetchObjectsByKeyWithCondition(item, keyToFind, results);
    });
  }

  // 2) If `data` is an object, check for the key
  else if (data && typeof data === 'object') {
    if (Object.prototype.hasOwnProperty.call(data, keyToFind)) {
      // e.g. data[keyToFind] might be a single object or an array
      let val = data[keyToFind];
      if (val) {
        // Force it to an array
        if (!Array.isArray(val) && Object.keys(val).length > 0) {
          val = [val];
          results.push(val);
        } else if (Array.isArray(val) && val.length) {
          results.push(val);
        }
      }
    }
    // Then recurse into each property in case there are more
    for (const prop in data) {
      fetchObjectsByKeyWithCondition(data[prop], keyToFind, results);
    }
  }

  return results;
}
