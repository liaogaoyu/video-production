class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function publicMessage(value) {
  return String(value || "")
    .replace(/device_code[=:]\s*\S+/gi, "device_code=[已隐藏]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏密钥]")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [已隐藏]")
    .slice(0, 300);
}

module.exports = { ApiError, publicMessage };
