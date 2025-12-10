// https://stackoverflow.com/a/32278428
function isJson(str) {
  try {
    return JSON.parse(str) && !!str;
  } catch (e) {
    return false;
  }
}

// https://stackoverflow.com/a/32516190
function trimChar(s, c) {
  if (c === "]") c = "\\]";
  if (c === "\\") c = "\\\\";
  return s.replace(new RegExp(
    "^[" + c + "]+|[" + c + "]+$", "g"
  ), "");
}

function isObject(object) {
  return Object.prototype.toString.call(object) === '[object Object]'
}

// https://stackoverflow.com/a/1026087
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function parseAction(action) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < action.length; i++) {
    const char = action[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current. length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

module.exports = {
  isJson: isJson,
  trimChar: trimChar,
  isObject: isObject,
  capitalize: capitalize,
  parseAction: parseAction
}