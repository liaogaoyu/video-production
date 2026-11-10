const crypto = require("node:crypto");
const https = require("node:https");
const { URL, URLSearchParams } = require("node:url");

function encode(value) {
  return encodeURIComponent(String(value))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function createImsClient(config = {}, env = process.env) {
  const accessKeyId = String(config.accessKeyId || env.STORYDOCK_OSS_ACCESS_KEY_ID || env.ALIYUN_ACCESS_KEY_ID || "");
  const accessKeySecret = String(config.accessKeySecret || env.STORYDOCK_OSS_ACCESS_KEY_SECRET || env.ALIYUN_ACCESS_KEY_SECRET || "");
  const region = String(config.region || env.STORYDOCK_IMS_REGION || env.STORYDOCK_OSS_REGION || "cn-hangzhou").replace(/^oss-/, "");
  const endpoint = String(config.endpoint || env.STORYDOCK_IMS_ENDPOINT || `ice.${region}.aliyuncs.com`);
  const enabled = Boolean(accessKeyId && accessKeySecret);

  function call(action, params = {}) {
    if (!enabled) return Promise.reject(new Error("阿里云 IMS 未配置 AccessKey"));
    const query = {
      Format: "JSON",
      Version: "2020-11-09",
      AccessKeyId: accessKeyId,
      SignatureMethod: "HMAC-SHA1",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      SignatureVersion: "1.0",
      SignatureNonce: crypto.randomUUID(),
      Action: action,
      ...params,
    };
    const canonical = Object.keys(query)
      .sort()
      .map((key) => `${encode(key)}=${encode(query[key])}`)
      .join("&");
    const stringToSign = `GET&${encode("/")}&${encode(canonical)}`;
    query.Signature = crypto.createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
    const url = new URL(`https://${endpoint}/`);
    url.search = new URLSearchParams(query).toString();
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let body;
            try {
              body = JSON.parse(text);
            } catch {
              reject(new Error(`IMS 返回无法解析：${text.slice(0, 200)}`));
              return;
            }
            if (res.statusCode >= 300 || body.Code) {
              reject(new Error(body.Message || body.Code || `IMS HTTP ${res.statusCode}`));
              return;
            }
            resolve(body);
          });
        })
        .on("error", reject);
    });
  }

  async function submitVideoDetext({ name, inputOss, outputOss, modelId = "algo-video-detext-new", jobParams }) {
    // ICE OpenAPI expects nested Input/Output as JSON strings on the RPC wire.
    const params = {
      Name: name || "subtitle-erase",
      FunctionName: "VideoDetext",
      Input: JSON.stringify({ Type: "OSS", Media: inputOss }),
      Output: JSON.stringify({ Type: "OSS", Media: outputOss }),
    };
    if (modelId) params.ModelId = modelId;
    if (jobParams) params.JobParams = typeof jobParams === "string" ? jobParams : JSON.stringify(jobParams);
    return call("SubmitIProductionJob", params);
  }

  async function queryJob(jobId) {
    return call("QueryIProductionJob", { JobId: jobId });
  }

  return { enabled, region, endpoint, call, submitVideoDetext, queryJob };
}

module.exports = { createImsClient };
