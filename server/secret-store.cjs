const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function loadMasterKey(file) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(file, key, { mode: 0o600 });
    return { key, created: true, file };
  }
  const key = fs.readFileSync(file);
  if (key.length !== 32) throw new Error("主密钥文件长度不正确");
  return { key, created: false, file };
}

function createSecretStore(masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new Error("主密钥无效");
  function seal(plaintext, { accountId = "", purpose } = {}) {
    if (!purpose) throw new Error("缺少密钥用途");
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, nonce);
    cipher.setAAD(Buffer.from(`${purpose}\0${accountId}`, "utf8"));
    const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    return {
      nonce: nonce.toString("hex"),
      ciphertext: Buffer.concat([body, cipher.getAuthTag()]).toString("hex"),
    };
  }
  function open(record, { accountId = "", purpose } = {}) {
    if (!purpose) throw new Error("缺少密钥用途");
    const nonce = Buffer.from(record.nonce, "hex");
    const blob = Buffer.from(record.ciphertext, "hex");
    if (nonce.length !== 12 || blob.length < 17) throw new Error("密钥数据无法解密");
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, nonce);
    decipher.setAAD(Buffer.from(`${purpose}\0${accountId}`, "utf8"));
    decipher.setAuthTag(blob.subarray(blob.length - 16));
    return Buffer.concat([decipher.update(blob.subarray(0, blob.length - 16)), decipher.final()]).toString("utf8");
  }
  return { seal, open };
}

module.exports = { loadMasterKey, createSecretStore };
