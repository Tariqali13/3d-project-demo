import { ACI_COLOR_TABLE } from '../constants';

export const rgbToHexEnhanced = (rgbStr) => {
  // Remove any extra spaces and split by comma
  const rgbArray = rgbStr
    .split(',')
    .map((component) => component.trim())
    .map(Number);

  // Validate the array
  if (rgbArray.length !== 3 || rgbArray.some((c) => isNaN(c))) {
    throw new Error("Invalid RGB format. Expected format: 'R,G,B'");
  }

  // Validate range
  if (rgbArray.some((c) => c < 0 || c > 255)) {
    throw new Error('RGB components must be between 0 and 255');
  }

  // Conversion helper
  const toHex = (decimal) => {
    const hex = decimal.toString(16).toUpperCase();
    return hex.length === 1 ? '0' + hex : hex;
  };

  const [r, g, b] = rgbArray;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const lerpColor = (c1, c2, t) => {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
};

export const intToHexColor = (colorValue) => {
  return colorValue & 0xffffff;
};

export const convertValueToHexColor = (value) => {
  // Convert the value to a hexadecimal string.
  // toString(16) converts to hex; we then uppercase it.
  const hex = value.toString(16).toUpperCase();
  // Pad the hex string with leading zeros to ensure it has 6 characters.
  const paddedHex = ('000000' + hex).slice(-6);
  // Return the color code with a '#' prefix.
  return '#' + paddedHex;
};
export const colorIndexToHex = (colorIndex) => {
  if (colorIndex === 0) {
    // "ByLayer" or "ByBlock" - default color or retrieve from layer properties
    return 0x000000; // Default to Black
  }
  return ACI_COLOR_TABLE[colorIndex] || 0x000000;
};

export const getHexColor = (element) => {
  if (
    element &&
    element.color &&
    typeof element.color == 'string' &&
    (element?.color?.includes('#') || element?.color?.includes('0x'))
  ) {
    return element.color;
  } else if (element.color && parseInt(element.color, 10) !== 0) {
    return intToHexColor(parseInt(element.color, 10));
  } else if (element.colorIndex && parseInt(element.colorIndex, 10) !== 0) {
    return colorIndexToHex(parseInt(element.colorIndex, 10));
  } else {
    return 0x000000; // Default color if none specified
  }
};

export const getHexColorCode = (color) => {
  if (color) {
    if (typeof color == Number || typeof color == 'number') {
      return convertValueToHexColor(color);
    }
    if (
      typeof color == 'string' &&
      (color?.includes('#') || color?.includes('0x'))
    ) {
      return color;
    } else {
      return rgbToHexEnhanced(color);
    }
  }
  return 0x000000; // Default color if none specified
};

export const hexToRgb = (hex) => {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};
