// https://stackoverflow.com/a/32278428
export function isJson(str) {
    try {
      return JSON.parse(str) && !!str;
  } catch (e) {
      return false;
  }
}

// https://stackoverflow.com/a/32516190
export function trimChar(s, c) {
  if (c === "]") c = "\\]";
  if (c === "\\") c = "\\\\";
  return s.replace(new RegExp(
    "^[" + c + "]+|[" + c + "]+$", "g"
  ), "");
}

export function isObject(object) {
  return Object.prototype.toString.call(object) === '[object Object]'
}

// https://stackoverflow.com/a/1026087
export function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}