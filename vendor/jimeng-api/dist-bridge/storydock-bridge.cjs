var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/storydock-bridge.ts
var import_node_readline = __toESM(require("readline"), 1);
var import_promises = __toESM(require("fs/promises"), 1);
var import_axios6 = __toESM(require("axios"), 1);
var import_https_proxy_agent2 = require("https-proxy-agent");

// src/api/controllers/videos.ts
var import_lodash8 = __toESM(require("lodash"), 1);
var import_fs_extra6 = __toESM(require("fs-extra"), 1);
var import_axios5 = __toESM(require("axios"), 1);

// src/lib/exceptions/Exception.ts
var import_assert = __toESM(require("assert"), 1);
var import_lodash = __toESM(require("lodash"), 1);
var Exception = class extends Error {
  /** 错误码 */
  errcode;
  /** 错误消息 */
  errmsg;
  /** 数据 */
  data;
  /** HTTP状态码 */
  httpStatusCode;
  /**
   * 构造异常
   * 
   * @param exception 异常
   * @param _errmsg 异常消息
   */
  constructor(exception, _errmsg) {
    (0, import_assert.default)(import_lodash.default.isArray(exception), "Exception must be Array");
    const [errcode, errmsg] = exception;
    (0, import_assert.default)(import_lodash.default.isFinite(errcode), "Exception errcode invalid");
    (0, import_assert.default)(import_lodash.default.isString(errmsg), "Exception errmsg invalid");
    super(_errmsg || errmsg);
    this.errcode = errcode;
    this.errmsg = _errmsg || errmsg;
  }
  compare(exception) {
    const [errcode] = exception;
    return this.errcode == errcode;
  }
  setHTTPStatusCode(value) {
    this.httpStatusCode = value;
    return this;
  }
  setData(value) {
    this.data = import_lodash.default.defaultTo(value, null);
    return this;
  }
};

// src/lib/exceptions/APIException.ts
var APIException = class extends Exception {
  /**
   * 构造异常
   * 
   * @param {[number, string]} exception 异常
   */
  constructor(exception, errmsg) {
    super(exception, errmsg);
  }
};

// src/api/consts/exceptions.ts
var exceptions_default = {
  API_TEST: [-9999, "API\u5F02\u5E38\u9519\u8BEF"],
  API_REQUEST_PARAMS_INVALID: [-2e3, "\u8BF7\u6C42\u53C2\u6570\u975E\u6CD5"],
  API_REQUEST_FAILED: [-2001, "\u8BF7\u6C42\u5931\u8D25"],
  API_TOKEN_EXPIRES: [-2002, "Token\u5DF2\u5931\u6548"],
  API_FILE_URL_INVALID: [-2003, "\u8FDC\u7A0B\u6587\u4EF6URL\u975E\u6CD5"],
  API_FILE_EXECEEDS_SIZE: [-2004, "\u8FDC\u7A0B\u6587\u4EF6\u8D85\u51FA\u5927\u5C0F"],
  API_CHAT_STREAM_PUSHING: [-2005, "\u5DF2\u6709\u5BF9\u8BDD\u6D41\u6B63\u5728\u8F93\u51FA"],
  API_CONTENT_FILTERED: [-2006, "\u5185\u5BB9\u7531\u4E8E\u5408\u89C4\u95EE\u9898\u5DF2\u88AB\u963B\u6B62\u751F\u6210"],
  API_IMAGE_GENERATION_FAILED: [-2007, "\u56FE\u50CF\u751F\u6210\u5931\u8D25"],
  API_VIDEO_GENERATION_FAILED: [-2008, "\u89C6\u9891\u751F\u6210\u5931\u8D25"],
  API_IMAGE_GENERATION_INSUFFICIENT_POINTS: [-2009, "\u5373\u68A6\u79EF\u5206\u4E0D\u8DB3"]
};

// src/lib/util.ts
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_stream = require("stream");
var import_colors = require("colors");
var import_mime = __toESM(require("mime"), 1);
var import_axios = __toESM(require("axios"), 1);
var import_fs_extra = __toESM(require("fs-extra"), 1);
var import_uuid = require("uuid");
var import_date_fns = require("date-fns");
var import_crc_32 = __toESM(require("crc-32"), 1);
var import_randomstring = __toESM(require("randomstring"), 1);
var import_lodash2 = __toESM(require("lodash"), 1);
var import_cron = require("cron");

// src/lib/http-status-codes.ts
var http_status_codes_default = {
  CONTINUE: 100,
  //客户端应当继续发送请求。这个临时响应是用来通知客户端它的部分请求已经被服务器接收，且仍未被拒绝。客户端应当继续发送请求的剩余部分，或者如果请求已经完成，忽略这个响应。服务器必须在请求完成后向客户端发送一个最终响应
  SWITCHING_PROTOCOLS: 101,
  //服务器已经理解了客户端的请求，并将通过Upgrade 消息头通知客户端采用不同的协议来完成这个请求。在发送完这个响应最后的空行后，服务器将会切换到在Upgrade 消息头中定义的那些协议。只有在切换新的协议更有好处的时候才应该采取类似措施。例如，切换到新的HTTP 版本比旧版本更有优势，或者切换到一个实时且同步的协议以传送利用此类特性的资源
  PROCESSING: 102,
  //处理将被继续执行
  OK: 200,
  //请求已成功，请求所希望的响应头或数据体将随此响应返回
  CREATED: 201,
  //请求已经被实现，而且有一个新的资源已经依据请求的需要而建立，且其 URI 已经随Location 头信息返回。假如需要的资源无法及时建立的话，应当返回 '202 Accepted'
  ACCEPTED: 202,
  //服务器已接受请求，但尚未处理。正如它可能被拒绝一样，最终该请求可能会也可能不会被执行。在异步操作的场合下，没有比发送这个状态码更方便的做法了。返回202状态码的响应的目的是允许服务器接受其他过程的请求（例如某个每天只执行一次的基于批处理的操作），而不必让客户端一直保持与服务器的连接直到批处理操作全部完成。在接受请求处理并返回202状态码的响应应当在返回的实体中包含一些指示处理当前状态的信息，以及指向处理状态监视器或状态预测的指针，以便用户能够估计操作是否已经完成
  NON_AUTHORITATIVE_INFO: 203,
  //服务器已成功处理了请求，但返回的实体头部元信息不是在原始服务器上有效的确定集合，而是来自本地或者第三方的拷贝。当前的信息可能是原始版本的子集或者超集。例如，包含资源的元数据可能导致原始服务器知道元信息的超级。使用此状态码不是必须的，而且只有在响应不使用此状态码便会返回200 OK的情况下才是合适的
  NO_CONTENT: 204,
  //服务器成功处理了请求，但不需要返回任何实体内容，并且希望返回更新了的元信息。响应可能通过实体头部的形式，返回新的或更新后的元信息。如果存在这些头部信息，则应当与所请求的变量相呼应。如果客户端是浏览器的话，那么用户浏览器应保留发送了该请求的页面，而不产生任何文档视图上的变化，即使按照规范新的或更新后的元信息应当被应用到用户浏览器活动视图中的文档。由于204响应被禁止包含任何消息体，因此它始终以消息头后的第一个空行结尾
  RESET_CONTENT: 205,
  //服务器成功处理了请求，且没有返回任何内容。但是与204响应不同，返回此状态码的响应要求请求者重置文档视图。该响应主要是被用于接受用户输入后，立即重置表单，以便用户能够轻松地开始另一次输入。与204响应一样，该响应也被禁止包含任何消息体，且以消息头后的第一个空行结束
  PARTIAL_CONTENT: 206,
  //服务器已经成功处理了部分 GET 请求。类似于FlashGet或者迅雷这类的HTTP下载工具都是使用此类响应实现断点续传或者将一个大文档分解为多个下载段同时下载。该请求必须包含 Range 头信息来指示客户端希望得到的内容范围，并且可能包含 If-Range 来作为请求条件。响应必须包含如下的头部域：Content-Range 用以指示本次响应中返回的内容的范围；如果是Content-Type为multipart/byteranges的多段下载，则每一段multipart中都应包含Content-Range域用以指示本段的内容范围。假如响应中包含Content-Length，那么它的数值必须匹配它返回的内容范围的真实字节数。Date和ETag或Content-Location，假如同样的请求本应该返回200响应。Expires, Cache-Control，和/或 Vary，假如其值可能与之前相同变量的其他响应对应的值不同的话。假如本响应请求使用了 If-Range 强缓存验证，那么本次响应不应该包含其他实体头；假如本响应的请求使用了 If-Range 弱缓存验证，那么本次响应禁止包含其他实体头；这避免了缓存的实体内容和更新了的实体头信息之间的不一致。否则，本响应就应当包含所有本应该返回200响应中应当返回的所有实体头部域。假如 ETag 或 Latest-Modified 头部不能精确匹配的话，则客户端缓存应禁止将206响应返回的内容与之前任何缓存过的内容组合在一起。任何不支持 Range 以及 Content-Range 头的缓存都禁止缓存206响应返回的内容
  MULTIPLE_STATUS: 207,
  //代表之后的消息体将是一个XML消息，并且可能依照之前子请求数量的不同，包含一系列独立的响应代码
  MULTIPLE_CHOICES: 300,
  //被请求的资源有一系列可供选择的回馈信息，每个都有自己特定的地址和浏览器驱动的商议信息。用户或浏览器能够自行选择一个首选的地址进行重定向。除非这是一个HEAD请求，否则该响应应当包括一个资源特性及地址的列表的实体，以便用户或浏览器从中选择最合适的重定向地址。这个实体的格式由Content-Type定义的格式所决定。浏览器可能根据响应的格式以及浏览器自身能力，自动作出最合适的选择。当然，RFC 2616规范并没有规定这样的自动选择该如何进行。如果服务器本身已经有了首选的回馈选择，那么在Location中应当指明这个回馈的 URI；浏览器可能会将这个 Location 值作为自动重定向的地址。此外，除非额外指定，否则这个响应也是可缓存的
  MOVED_PERMANENTLY: 301,
  //被请求的资源已永久移动到新位置，并且将来任何对此资源的引用都应该使用本响应返回的若干个URI之一。如果可能，拥有链接编辑功能的客户端应当自动把请求的地址修改为从服务器反馈回来的地址。除非额外指定，否则这个响应也是可缓存的。新的永久性的URI应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。如果这不是一个GET或者HEAD请求，因此浏览器禁止自动进行重定向，除非得到用户的确认，因为请求的条件可能因此发生变化。注意：对于某些使用 HTTP/1.0 协议的浏览器，当它们发送的POST请求得到了一个301响应的话，接下来的重定向请求将会变成GET方式
  FOUND: 302,
  //请求的资源现在临时从不同的URI响应请求。由于这样的重定向是临时的，客户端应当继续向原有地址发送以后的请求。只有在Cache-Control或Expires中进行了指定的情况下，这个响应才是可缓存的。新的临时性的URI应当在响应的 Location 域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。如果这不是一个GET或者HEAD请求，那么浏览器禁止自动进行重定向，除非得到用户的确认，因为请求的条件可能因此发生变化。注意：虽然RFC 1945和RFC 2068规范不允许客户端在重定向时改变请求的方法，但是很多现存的浏览器将302响应视作为303响应，并且使用GET方式访问在Location中规定的URI，而无视原先请求的方法。状态码303和307被添加了进来，用以明确服务器期待客户端进行何种反应
  SEE_OTHER: 303,
  //对应当前请求的响应可以在另一个URI上被找到，而且客户端应当采用 GET 的方式访问那个资源。这个方法的存在主要是为了允许由脚本激活的POST请求输出重定向到一个新的资源。这个新的 URI 不是原始资源的替代引用。同时，303响应禁止被缓存。当然，第二个请求（重定向）可能被缓存。新的 URI 应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI的超链接及简短说明。注意：许多 HTTP/1.1 版以前的浏览器不能正确理解303状态。如果需要考虑与这些浏览器之间的互动，302状态码应该可以胜任，因为大多数的浏览器处理302响应时的方式恰恰就是上述规范要求客户端处理303响应时应当做的
  NOT_MODIFIED: 304,
  //如果客户端发送了一个带条件的GET请求且该请求已被允许，而文档的内容（自上次访问以来或者根据请求的条件）并没有改变，则服务器应当返回这个状态码。304响应禁止包含消息体，因此始终以消息头后的第一个空行结尾。该响应必须包含以下的头信息：Date，除非这个服务器没有时钟。假如没有时钟的服务器也遵守这些规则，那么代理服务器以及客户端可以自行将Date字段添加到接收到的响应头中去（正如RFC 2068中规定的一样），缓存机制将会正常工作。ETag或 Content-Location，假如同样的请求本应返回200响应。Expires, Cache-Control，和/或Vary，假如其值可能与之前相同变量的其他响应对应的值不同的话。假如本响应请求使用了强缓存验证，那么本次响应不应该包含其他实体头；否则（例如，某个带条件的 GET 请求使用了弱缓存验证），本次响应禁止包含其他实体头；这避免了缓存了的实体内容和更新了的实体头信息之间的不一致。假如某个304响应指明了当前某个实体没有缓存，那么缓存系统必须忽视这个响应，并且重复发送不包含限制条件的请求。假如接收到一个要求更新某个缓存条目的304响应，那么缓存系统必须更新整个条目以反映所有在响应中被更新的字段的值
  USE_PROXY: 305,
  //被请求的资源必须通过指定的代理才能被访问。Location域中将给出指定的代理所在的URI信息，接收者需要重复发送一个单独的请求，通过这个代理才能访问相应资源。只有原始服务器才能建立305响应。注意：RFC 2068中没有明确305响应是为了重定向一个单独的请求，而且只能被原始服务器建立。忽视这些限制可能导致严重的安全后果
  UNUSED: 306,
  //在最新版的规范中，306状态码已经不再被使用
  TEMPORARY_REDIRECT: 307,
  //请求的资源现在临时从不同的URI 响应请求。由于这样的重定向是临时的，客户端应当继续向原有地址发送以后的请求。只有在Cache-Control或Expires中进行了指定的情况下，这个响应才是可缓存的。新的临时性的URI 应当在响应的Location域中返回。除非这是一个HEAD请求，否则响应的实体中应当包含指向新的URI 的超链接及简短说明。因为部分浏览器不能识别307响应，因此需要添加上述必要信息以便用户能够理解并向新的 URI 发出访问请求。如果这不是一个GET或者HEAD请求，那么浏览器禁止自动进行重定向，除非得到用户的确认，因为请求的条件可能因此发生变化
  BAD_REQUEST: 400,
  //1.语义有误，当前请求无法被服务器理解。除非进行修改，否则客户端不应该重复提交这个请求 2.请求参数有误
  UNAUTHORIZED: 401,
  //当前请求需要用户验证。该响应必须包含一个适用于被请求资源的 WWW-Authenticate 信息头用以询问用户信息。客户端可以重复提交一个包含恰当的 Authorization 头信息的请求。如果当前请求已经包含了 Authorization 证书，那么401响应代表着服务器验证已经拒绝了那些证书。如果401响应包含了与前一个响应相同的身份验证询问，且浏览器已经至少尝试了一次验证，那么浏览器应当向用户展示响应中包含的实体信息，因为这个实体信息中可能包含了相关诊断信息。参见RFC 2617
  PAYMENT_REQUIRED: 402,
  //该状态码是为了将来可能的需求而预留的
  FORBIDDEN: 403,
  //服务器已经理解请求，但是拒绝执行它。与401响应不同的是，身份验证并不能提供任何帮助，而且这个请求也不应该被重复提交。如果这不是一个HEAD请求，而且服务器希望能够讲清楚为何请求不能被执行，那么就应该在实体内描述拒绝的原因。当然服务器也可以返回一个404响应，假如它不希望让客户端获得任何信息
  NOT_FOUND: 404,
  //请求失败，请求所希望得到的资源未被在服务器上发现。没有信息能够告诉用户这个状况到底是暂时的还是永久的。假如服务器知道情况的话，应当使用410状态码来告知旧资源因为某些内部的配置机制问题，已经永久的不可用，而且没有任何可以跳转的地址。404这个状态码被广泛应用于当服务器不想揭示到底为何请求被拒绝或者没有其他适合的响应可用的情况下
  METHOD_NOT_ALLOWED: 405,
  //请求行中指定的请求方法不能被用于请求相应的资源。该响应必须返回一个Allow 头信息用以表示出当前资源能够接受的请求方法的列表。鉴于PUT，DELETE方法会对服务器上的资源进行写操作，因而绝大部分的网页服务器都不支持或者在默认配置下不允许上述请求方法，对于此类请求均会返回405错误
  NO_ACCEPTABLE: 406,
  //请求的资源的内容特性无法满足请求头中的条件，因而无法生成响应实体。除非这是一个 HEAD 请求，否则该响应就应当返回一个包含可以让用户或者浏览器从中选择最合适的实体特性以及地址列表的实体。实体的格式由Content-Type头中定义的媒体类型决定。浏览器可以根据格式及自身能力自行作出最佳选择。但是，规范中并没有定义任何作出此类自动选择的标准
  PROXY_AUTHENTICATION_REQUIRED: 407,
  //与401响应类似，只不过客户端必须在代理服务器上进行身份验证。代理服务器必须返回一个Proxy-Authenticate用以进行身份询问。客户端可以返回一个Proxy-Authorization信息头用以验证。参见RFC 2617
  REQUEST_TIMEOUT: 408,
  //请求超时。客户端没有在服务器预备等待的时间内完成一个请求的发送。客户端可以随时再次提交这一请求而无需进行任何更改
  CONFLICT: 409,
  //由于和被请求的资源的当前状态之间存在冲突，请求无法完成。这个代码只允许用在这样的情况下才能被使用：用户被认为能够解决冲突，并且会重新提交新的请求。该响应应当包含足够的信息以便用户发现冲突的源头。冲突通常发生于对PUT请求的处理中。例如，在采用版本检查的环境下，某次PUT提交的对特定资源的修改请求所附带的版本信息与之前的某个（第三方）请求向冲突，那么此时服务器就应该返回一个409错误，告知用户请求无法完成。此时，响应实体中很可能会包含两个冲突版本之间的差异比较，以便用户重新提交归并以后的新版本
  GONE: 410,
  //被请求的资源在服务器上已经不再可用，而且没有任何已知的转发地址。这样的状况应当被认为是永久性的。如果可能，拥有链接编辑功能的客户端应当在获得用户许可后删除所有指向这个地址的引用。如果服务器不知道或者无法确定这个状况是否是永久的，那么就应该使用404状态码。除非额外说明，否则这个响应是可缓存的。410响应的目的主要是帮助网站管理员维护网站，通知用户该资源已经不再可用，并且服务器拥有者希望所有指向这个资源的远端连接也被删除。这类事件在限时、增值服务中很普遍。同样，410响应也被用于通知客户端在当前服务器站点上，原本属于某个个人的资源已经不再可用。当然，是否需要把所有永久不可用的资源标记为'410 Gone'，以及是否需要保持此标记多长时间，完全取决于服务器拥有者
  LENGTH_REQUIRED: 411,
  //服务器拒绝在没有定义Content-Length头的情况下接受请求。在添加了表明请求消息体长度的有效Content-Length头之后，客户端可以再次提交该请求 
  PRECONDITION_FAILED: 412,
  //服务器在验证在请求的头字段中给出先决条件时，没能满足其中的一个或多个。这个状态码允许客户端在获取资源时在请求的元信息（请求头字段数据）中设置先决条件，以此避免该请求方法被应用到其希望的内容以外的资源上
  REQUEST_ENTITY_TOO_LARGE: 413,
  //服务器拒绝处理当前请求，因为该请求提交的实体数据大小超过了服务器愿意或者能够处理的范围。此种情况下，服务器可以关闭连接以免客户端继续发送此请求。如果这个状况是临时的，服务器应当返回一个 Retry-After 的响应头，以告知客户端可以在多少时间以后重新尝试
  REQUEST_URI_TOO_LONG: 414,
  //请求的URI长度超过了服务器能够解释的长度，因此服务器拒绝对该请求提供服务。这比较少见，通常的情况包括：本应使用POST方法的表单提交变成了GET方法，导致查询字符串（Query String）过长。重定向URI “黑洞”，例如每次重定向把旧的URI作为新的URI的一部分，导致在若干次重定向后URI超长。客户端正在尝试利用某些服务器中存在的安全漏洞攻击服务器。这类服务器使用固定长度的缓冲读取或操作请求的URI，当GET后的参数超过某个数值后，可能会产生缓冲区溢出，导致任意代码被执行[1]。没有此类漏洞的服务器，应当返回414状态码
  UNSUPPORTED_MEDIA_TYPE: 415,
  //对于当前请求的方法和所请求的资源，请求中提交的实体并不是服务器中所支持的格式，因此请求被拒绝
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  //如果请求中包含了Range请求头，并且Range中指定的任何数据范围都与当前资源的可用范围不重合，同时请求中又没有定义If-Range请求头，那么服务器就应当返回416状态码。假如Range使用的是字节范围，那么这种情况就是指请求指定的所有数据范围的首字节位置都超过了当前资源的长度。服务器也应当在返回416状态码的同时，包含一个Content-Range实体头，用以指明当前资源的长度。这个响应也被禁止使用multipart/byteranges作为其 Content-Type
  EXPECTION_FAILED: 417,
  //在请求头Expect中指定的预期内容无法被服务器满足，或者这个服务器是一个代理服务器，它有明显的证据证明在当前路由的下一个节点上，Expect的内容无法被满足
  TOO_MANY_CONNECTIONS: 421,
  //从当前客户端所在的IP地址到服务器的连接数超过了服务器许可的最大范围。通常，这里的IP地址指的是从服务器上看到的客户端地址（比如用户的网关或者代理服务器地址）。在这种情况下，连接数的计算可能涉及到不止一个终端用户
  UNPROCESSABLE_ENTITY: 422,
  //请求格式正确，但是由于含有语义错误，无法响应
  FAILED_DEPENDENCY: 424,
  //由于之前的某个请求发生的错误，导致当前请求失败，例如PROPPATCH
  UNORDERED_COLLECTION: 425,
  //在WebDav Advanced Collections 草案中定义，但是未出现在《WebDAV 顺序集协议》（RFC 3658）中
  UPGRADE_REQUIRED: 426,
  //客户端应当切换到TLS/1.0
  RETRY_WITH: 449,
  //由微软扩展，代表请求应当在执行完适当的操作后进行重试
  INTERNAL_SERVER_ERROR: 500,
  //服务器遇到了一个未曾预料的状况，导致了它无法完成对请求的处理。一般来说，这个问题都会在服务器的程序码出错时出现
  NOT_IMPLEMENTED: 501,
  //服务器不支持当前请求所需要的某个功能。当服务器无法识别请求的方法，并且无法支持其对任何资源的请求
  BAD_GATEWAY: 502,
  //作为网关或者代理工作的服务器尝试执行请求时，从上游服务器接收到无效的响应
  SERVICE_UNAVAILABLE: 503,
  //由于临时的服务器维护或者过载，服务器当前无法处理请求。这个状况是临时的，并且将在一段时间以后恢复。如果能够预计延迟时间，那么响应中可以包含一个 Retry-After 头用以标明这个延迟时间。如果没有给出这个 Retry-After 信息，那么客户端应当以处理500响应的方式处理它。注意：503状态码的存在并不意味着服务器在过载的时候必须使用它。某些服务器只不过是希望拒绝客户端的连接
  GATEWAY_TIMEOUT: 504,
  //作为网关或者代理工作的服务器尝试执行请求时，未能及时从上游服务器（URI标识出的服务器，例如HTTP、FTP、LDAP）或者辅助服务器（例如DNS）收到响应。注意：某些代理服务器在DNS查询超时时会返回400或者500错误
  HTTP_VERSION_NOT_SUPPORTED: 505,
  //服务器不支持，或者拒绝支持在请求中使用的HTTP版本。这暗示着服务器不能或不愿使用与客户端相同的版本。响应中应当包含一个描述了为何版本不被支持以及服务器支持哪些协议的实体
  VARIANT_ALSO_NEGOTIATES: 506,
  //服务器存在内部配置错误：被请求的协商变元资源被配置为在透明内容协商中使用自己，因此在一个协商处理中不是一个合适的重点
  INSUFFICIENT_STORAGE: 507,
  //服务器无法存储完成请求所必须的内容。这个状况被认为是临时的
  BANDWIDTH_LIMIT_EXCEEDED: 509,
  //服务器达到带宽限制。这不是一个官方的状态码，但是仍被广泛使用
  NOT_EXTENDED: 510
  //获取资源所需要的策略并没有没满足
};

// src/lib/util.ts
var autoIdMap = /* @__PURE__ */ new Map();
var util = {
  is2DArrays(value) {
    return import_lodash2.default.isArray(value) && (!value[0] || import_lodash2.default.isArray(value[0]) && import_lodash2.default.isArray(value[value.length - 1]));
  },
  uuid: (separator = true) => separator ? (0, import_uuid.v4)() : (0, import_uuid.v4)().replace(/\-/g, ""),
  autoId: (prefix = "") => {
    let index = autoIdMap.get(prefix);
    if (index > 999999) index = 0;
    autoIdMap.set(prefix, (index || 0) + 1);
    return `${prefix}${index || 1}`;
  },
  ignoreJSONParse(value) {
    const result = import_lodash2.default.attempt(() => JSON.parse(value));
    if (import_lodash2.default.isError(result)) return null;
    return result;
  },
  generateRandomString(options) {
    return import_randomstring.default.generate(options);
  },
  getResponseContentType(value) {
    return value.headers ? value.headers["content-type"] || value.headers["Content-Type"] : null;
  },
  mimeToExtension(value) {
    let extension = import_mime.default.getExtension(value);
    if (extension == "mpga") return "mp3";
    return extension;
  },
  extractURLExtension(value) {
    const extname = import_path.default.extname(new URL(value).pathname);
    return extname.substring(1).toLowerCase();
  },
  createCronJob(cronPatterns, callback) {
    if (!import_lodash2.default.isFunction(callback))
      throw new Error("callback must be an Function");
    return new import_cron.CronJob(
      cronPatterns,
      () => callback(),
      null,
      false,
      "Asia/Shanghai"
    );
  },
  getDateString(format = "yyyy-MM-dd", date = /* @__PURE__ */ new Date()) {
    return (0, import_date_fns.format)(date, format);
  },
  getIPAddressesByIPv4() {
    const interfaces = import_os.default.networkInterfaces();
    const addresses = [];
    for (let name in interfaces) {
      const networks = interfaces[name];
      const results = networks.filter(
        (network) => network.family === "IPv4" && network.address !== "127.0.0.1" && !network.internal
      );
      if (results[0] && results[0].address) addresses.push(results[0].address);
    }
    return addresses;
  },
  getMACAddressesByIPv4() {
    const interfaces = import_os.default.networkInterfaces();
    const addresses = [];
    for (let name in interfaces) {
      const networks = interfaces[name];
      const results = networks.filter(
        (network) => network.family === "IPv4" && network.address !== "127.0.0.1" && !network.internal
      );
      if (results[0] && results[0].mac) addresses.push(results[0].mac);
    }
    return addresses;
  },
  generateSSEData(event, data, retry) {
    return `event: ${event || "message"}
data: ${(data || "").replace(/\n/g, "\\n").replace(/\s/g, "\\s")}
retry: ${retry || 3e3}

`;
  },
  buildDataBASE64(type, ext, buffer) {
    return `data:${type}/${ext.replace("jpg", "jpeg")};base64,${buffer.toString(
      "base64"
    )}`;
  },
  isLinux() {
    return import_os.default.platform() !== "win32";
  },
  isIPAddress(value) {
    return import_lodash2.default.isString(value) && (/^((2[0-4]\d|25[0-5]|[01]?\d\d?)\.){3}(2[0-4]\d|25[0-5]|[01]?\d\d?)$/.test(
      value
    ) || /\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*/.test(
      value
    ));
  },
  isPort(value) {
    return import_lodash2.default.isNumber(value) && value > 0 && value < 65536;
  },
  isReadStream(value) {
    return value && (value instanceof import_stream.Readable || "readable" in value || value.readable);
  },
  isWriteStream(value) {
    return value && (value instanceof import_stream.Writable || "writable" in value || value.writable);
  },
  isHttpStatusCode(value) {
    return import_lodash2.default.isNumber(value) && Object.values(http_status_codes_default).includes(value);
  },
  isURL(value) {
    return !import_lodash2.default.isUndefined(value) && /^(http|https)/.test(value);
  },
  isSrc(value) {
    return !import_lodash2.default.isUndefined(value) && /^\/.+\.[0-9a-zA-Z]+(\?.+)?$/.test(value);
  },
  isBASE64(value) {
    return !import_lodash2.default.isUndefined(value) && /^[a-zA-Z0-9\/\+]+(=?)+$/.test(value);
  },
  isBASE64Data(value) {
    return /^data:/.test(value);
  },
  extractBASE64DataFormat(value) {
    const match = value.trim().match(/^data:(.+);base64,/);
    if (!match) return null;
    return match[1];
  },
  removeBASE64DataHeader(value) {
    return value.replace(/^data:(.+);base64,/, "");
  },
  isDataString(value) {
    return /^(base64|json):/.test(value);
  },
  isStringNumber(value) {
    return import_lodash2.default.isFinite(Number(value));
  },
  isUnixTimestamp(value) {
    return /^[0-9]{10}$/.test(`${value}`);
  },
  isTimestamp(value) {
    return /^[0-9]{13}$/.test(`${value}`);
  },
  isEmail(value) {
    return /^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+\.[a-zA-Z]{2,3}$/.test(
      value
    );
  },
  isAsyncFunction(value) {
    return Object.prototype.toString.call(value) === "[object AsyncFunction]";
  },
  async isAPNG(filePath) {
    let head;
    const readStream = import_fs_extra.default.createReadStream(filePath, { start: 37, end: 40 });
    const readPromise = new Promise((resolve, reject) => {
      readStream.once("end", resolve);
      readStream.once("error", reject);
    });
    readStream.once("data", (data) => head = data);
    await readPromise;
    return head.compare(Buffer.from([97, 99, 84, 76])) === 0;
  },
  unixTimestamp() {
    return parseInt(`${Date.now() / 1e3}`);
  },
  timestamp() {
    return Date.now();
  },
  urlJoin(...values) {
    let url = "";
    for (let i = 0; i < values.length; i++)
      url += `${i > 0 ? "/" : ""}${values[i].replace(/^\/*/, "").replace(/\/*$/, "")}`;
    return url;
  },
  millisecondsToHmss(milliseconds) {
    if (import_lodash2.default.isString(milliseconds)) return milliseconds;
    milliseconds = parseInt(milliseconds);
    const sec = Math.floor(milliseconds / 1e3);
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec - hours * 3600) / 60);
    const seconds = sec - hours * 3600 - minutes * 60;
    const ms = milliseconds % 6e4 - seconds * 1e3;
    return `${hours > 9 ? hours : "0" + hours}:${minutes > 9 ? minutes : "0" + minutes}:${seconds > 9 ? seconds : "0" + seconds}.${ms}`;
  },
  millisecondsToTimeString(milliseconds) {
    if (milliseconds < 1e3) return `${milliseconds}ms`;
    if (milliseconds < 6e4)
      return `${parseFloat((milliseconds / 1e3).toFixed(2))}s`;
    return `${Math.floor(milliseconds / 1e3 / 60)}m${Math.floor(
      milliseconds / 1e3 % 60
    )}s`;
  },
  rgbToHex(r, g, b) {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },
  hexToRgb(hex) {
    const value = parseInt(hex.replace(/^#/, ""), 16);
    return [value >> 16 & 255, value >> 8 & 255, value & 255];
  },
  md5(value) {
    return import_crypto.default.createHash("md5").update(value).digest("hex");
  },
  crc32(value) {
    return import_lodash2.default.isBuffer(value) ? import_crc_32.default.buf(value) : import_crc_32.default.str(value);
  },
  arrayParse(value) {
    return import_lodash2.default.isArray(value) ? value : [value];
  },
  booleanParse(value) {
    return value === "true" || value === true ? true : false;
  },
  encodeBASE64(value) {
    return Buffer.from(value).toString("base64");
  },
  decodeBASE64(value) {
    return Buffer.from(value, "base64").toString();
  },
  async fetchFileBASE64(url) {
    const result = await import_axios.default.get(url, {
      responseType: "arraybuffer"
    });
    return result.data.toString("base64");
  },
  /**
   * 计算 ArrayBuffer 的 CRC32 值
   * @param buffer ArrayBuffer 数据
   * @returns CRC32 十六进制字符串
   */
  calculateCRC32(buffer) {
    const crcTable = [];
    for (let i = 0; i < 256; i++) {
      let crc2 = i;
      for (let j = 0; j < 8; j++) {
        crc2 = crc2 & 1 ? 3988292384 ^ crc2 >>> 1 : crc2 >>> 1;
      }
      crcTable[i] = crc2;
    }
    let crc = 0 ^ -1;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      crc = crc >>> 8 ^ crcTable[(crc ^ bytes[i]) & 255];
    }
    return ((crc ^ -1) >>> 0).toString(16).padStart(8, "0");
  }
};
var util_default = util;

// src/api/controllers/core.ts
var import_lodash7 = __toESM(require("lodash"), 1);
var import_mime2 = __toESM(require("mime"), 1);
var import_axios2 = __toESM(require("axios"), 1);
var import_https_proxy_agent = require("https-proxy-agent");
var import_socks_proxy_agent = require("socks-proxy-agent");

// src/lib/logger.ts
var import_path5 = __toESM(require("path"), 1);
var import_util2 = __toESM(require("util"), 1);
var import_colors2 = require("colors");
var import_lodash6 = __toESM(require("lodash"), 1);
var import_fs_extra5 = __toESM(require("fs-extra"), 1);
var import_date_fns2 = require("date-fns");

// src/lib/configs/service-config.ts
var import_path3 = __toESM(require("path"), 1);
var import_fs_extra3 = __toESM(require("fs-extra"), 1);
var import_yaml = __toESM(require("yaml"), 1);
var import_lodash4 = __toESM(require("lodash"), 1);

// src/lib/environment.ts
var import_path2 = __toESM(require("path"), 1);
var import_fs_extra2 = __toESM(require("fs-extra"), 1);
var import_minimist = __toESM(require("minimist"), 1);
var import_lodash3 = __toESM(require("lodash"), 1);
var cmdArgs = (0, import_minimist.default)(process.argv.slice(2));
var envVars = process.env;
var Environment = class {
  /** 命令行参数 */
  cmdArgs;
  /** 环境变量 */
  envVars;
  /** 环境名称 */
  env;
  /** 服务名称 */
  name;
  /** 服务地址 */
  host;
  /** 服务端口 */
  port;
  /** 包参数 */
  package;
  constructor(options = {}) {
    const { cmdArgs: cmdArgs2, envVars: envVars2, package: _package } = options;
    this.cmdArgs = cmdArgs2;
    this.envVars = envVars2;
    this.env = import_lodash3.default.defaultTo(cmdArgs2.env || envVars2.SERVER_ENV, "dev");
    this.name = cmdArgs2.name || envVars2.SERVER_NAME || void 0;
    this.host = cmdArgs2.host || envVars2.SERVER_HOST || void 0;
    this.port = Number(cmdArgs2.port || envVars2.SERVER_PORT) ? Number(cmdArgs2.port || envVars2.SERVER_PORT) : void 0;
    this.package = _package;
  }
};
var environment_default = new Environment({
  cmdArgs,
  envVars,
  package: JSON.parse(import_fs_extra2.default.readFileSync(import_path2.default.join(import_path2.default.resolve(), "package.json")).toString())
});

// src/lib/configs/service-config.ts
var CONFIG_PATH = import_path3.default.join(import_path3.default.resolve(), "configs/", environment_default.env, "/service.yml");
var ServiceConfig = class _ServiceConfig {
  /** 服务名称 */
  name;
  /** @type {string} 服务绑定主机地址 */
  host;
  /** @type {number} 服务绑定端口 */
  port;
  /** @type {string} 服务路由前缀 */
  urlPrefix;
  /** @type {string} 服务绑定地址（外部访问地址） */
  bindAddress;
  constructor(options) {
    const { name, host, port, urlPrefix, bindAddress } = options || {};
    this.name = import_lodash4.default.defaultTo(name, "jimeng-api");
    this.host = import_lodash4.default.defaultTo(host, "0.0.0.0");
    this.port = import_lodash4.default.defaultTo(port, 5566);
    this.urlPrefix = import_lodash4.default.defaultTo(urlPrefix, "");
    this.bindAddress = bindAddress;
  }
  get addressHost() {
    if (this.bindAddress) return this.bindAddress;
    const ipAddresses = util_default.getIPAddressesByIPv4();
    for (let ipAddress of ipAddresses) {
      if (ipAddress === this.host)
        return ipAddress;
    }
    return ipAddresses[0] || "127.0.0.1";
  }
  get address() {
    return `${this.addressHost}:${this.port}`;
  }
  get pageDirUrl() {
    return `http://127.0.0.1:${this.port}/page`;
  }
  static load() {
    const external = import_lodash4.default.pickBy(environment_default, (v, k) => ["name", "host", "port"].includes(k) && !import_lodash4.default.isUndefined(v));
    if (!import_fs_extra3.default.pathExistsSync(CONFIG_PATH)) return new _ServiceConfig(external);
    const data = import_yaml.default.parse(import_fs_extra3.default.readFileSync(CONFIG_PATH).toString());
    return new _ServiceConfig({ ...data, ...external });
  }
};
var service_config_default = ServiceConfig.load();

// src/lib/configs/system-config.ts
var import_path4 = __toESM(require("path"), 1);
var import_fs_extra4 = __toESM(require("fs-extra"), 1);
var import_yaml2 = __toESM(require("yaml"), 1);
var import_lodash5 = __toESM(require("lodash"), 1);
var CONFIG_PATH2 = import_path4.default.join(import_path4.default.resolve(), "configs/", environment_default.env, "/system.yml");
var SystemConfig = class _SystemConfig {
  /** 是否开启请求日志 */
  requestLog;
  /** 临时目录路径 */
  tmpDir;
  /** 日志目录路径 */
  logDir;
  /** 日志写入间隔（毫秒） */
  logWriteInterval;
  /** 日志文件有效期（毫秒） */
  logFileExpires;
  /** 临时文件有效期（毫秒） */
  tmpFileExpires;
  /** 请求体配置 */
  requestBody;
  /** 是否调试模式 */
  debug;
  /** 日志级别 */
  log_level;
  constructor(options) {
    const { requestLog, tmpDir, logDir, logWriteInterval, logFileExpires, tmpFileExpires, requestBody, debug, log_level } = options || {};
    this.requestLog = import_lodash5.default.defaultTo(requestLog, false);
    this.tmpDir = import_lodash5.default.defaultTo(tmpDir, "./tmp");
    this.logDir = import_lodash5.default.defaultTo(logDir, "./logs");
    this.logWriteInterval = import_lodash5.default.defaultTo(logWriteInterval, 200);
    this.logFileExpires = import_lodash5.default.defaultTo(logFileExpires, 262656e4);
    this.tmpFileExpires = import_lodash5.default.defaultTo(tmpFileExpires, 864e5);
    this.requestBody = Object.assign(requestBody || {}, {
      enableTypes: ["form", "text", "xml"],
      // 移除 json，由自定义中间件处理
      encoding: "utf-8",
      formLimit: "100mb",
      jsonLimit: "100mb",
      textLimit: "100mb",
      xmlLimit: "100mb",
      formidable: {
        maxFileSize: "100mb"
      },
      multipart: true,
      parsedMethods: ["POST", "PUT", "PATCH"]
    });
    this.debug = import_lodash5.default.defaultTo(debug, true);
    this.log_level = import_lodash5.default.defaultTo(log_level, "info");
  }
  get rootDirPath() {
    return import_path4.default.resolve();
  }
  get tmpDirPath() {
    return import_path4.default.resolve(this.tmpDir);
  }
  get logDirPath() {
    return import_path4.default.resolve(this.logDir);
  }
  static load() {
    if (!import_fs_extra4.default.pathExistsSync(CONFIG_PATH2)) return new _SystemConfig();
    const data = import_yaml2.default.parse(import_fs_extra4.default.readFileSync(CONFIG_PATH2).toString());
    return new _SystemConfig(data);
  }
};
var system_config_default = SystemConfig.load();

// src/lib/config.ts
var Config = class {
  /** 服务配置 */
  service = service_config_default;
  /** 系统配置 */
  system = system_config_default;
};
var config_default = new Config();

// src/lib/logger.ts
var isVercelEnv = process.env.VERCEL;
var LogWriter = class {
  #buffers = [];
  constructor() {
    !isVercelEnv && import_fs_extra5.default.ensureDirSync(config_default.system.logDirPath);
    !isVercelEnv && this.work();
  }
  push(content) {
    const buffer = Buffer.from(content);
    this.#buffers.push(buffer);
  }
  writeSync(buffer) {
    !isVercelEnv && import_fs_extra5.default.appendFileSync(import_path5.default.join(config_default.system.logDirPath, `/${util_default.getDateString()}.log`), buffer);
  }
  async write(buffer) {
    !isVercelEnv && await import_fs_extra5.default.appendFile(import_path5.default.join(config_default.system.logDirPath, `/${util_default.getDateString()}.log`), buffer);
  }
  flush() {
    if (!this.#buffers.length) return;
    !isVercelEnv && import_fs_extra5.default.appendFileSync(import_path5.default.join(config_default.system.logDirPath, `/${util_default.getDateString()}.log`), Buffer.concat(this.#buffers));
  }
  work() {
    if (!this.#buffers.length) return setTimeout(this.work.bind(this), config_default.system.logWriteInterval);
    const buffer = Buffer.concat(this.#buffers);
    this.#buffers = [];
    this.write(buffer).finally(() => setTimeout(this.work.bind(this), config_default.system.logWriteInterval)).catch((err) => console.error("Log write error:", err));
  }
};
var LogText = class {
  /** @type {string} 日志级别 */
  level;
  /** @type {string} 日志文本 */
  text;
  /** @type {string} 日志来源 */
  source;
  /** @type {Date} 日志发生时间 */
  time = /* @__PURE__ */ new Date();
  constructor(level, ...params) {
    this.level = level;
    this.text = import_util2.default.format.apply(null, params);
    this.source = this.#getStackTopCodeInfo();
  }
  #getStackTopCodeInfo() {
    const unknownInfo = { name: "unknown", codeLine: 0, codeColumn: 0 };
    const stackArray = new Error().stack.split("\n");
    const text = stackArray[4];
    if (!text)
      return unknownInfo;
    const match = text.match(/at (.+) \((.+)\)/) || text.match(/at (.+)/);
    if (!match || !import_lodash6.default.isString(match[2] || match[1]))
      return unknownInfo;
    const temp = match[2] || match[1];
    const _match = temp.match(/([a-zA-Z0-9_\-\.]+)\:(\d+)\:(\d+)$/);
    if (!_match)
      return unknownInfo;
    const [, scriptPath, codeLine, codeColumn] = _match;
    return {
      name: scriptPath ? scriptPath.replace(/.js$/, "") : "unknown",
      path: scriptPath || null,
      codeLine: parseInt(codeLine || 0),
      codeColumn: parseInt(codeColumn || 0)
    };
  }
  toString() {
    return `[${(0, import_date_fns2.format)(this.time, "yyyy-MM-dd HH:mm:ss.SSS")}][${this.level}][${this.source.name}<${this.source.codeLine},${this.source.codeColumn}>] ${this.text}`;
  }
};
var Logger = class _Logger {
  /** @type {Object} 系统配置 */
  config = {};
  /** @type {Object} 日志级别映射 */
  static Level = {
    Info: "info",
    Debug: "debug",
    Warning: "warning",
    Error: "error"
  };
  /** @type {Object} 日志级别文本颜色樱色 */
  static LevelColor = {
    [_Logger.Level.Success]: "green",
    [_Logger.Level.Info]: "brightCyan",
    [_Logger.Level.Debug]: "white",
    [_Logger.Level.Warning]: "brightYellow",
    [_Logger.Level.Error]: "brightRed",
    [_Logger.Level.Fatal]: "red"
  };
  static LevelPriority = {
    [_Logger.Level.Fatal]: 1,
    [_Logger.Level.Error]: 2,
    [_Logger.Level.Warning]: 3,
    [_Logger.Level.Success]: 4,
    [_Logger.Level.Info]: 5,
    [_Logger.Level.Log]: 6,
    [_Logger.Level.Debug]: 7
  };
  #writer;
  constructor() {
    this.#writer = new LogWriter();
  }
  header() {
    this.#writer.writeSync(Buffer.from(`

===================== LOG START ${(0, import_date_fns2.format)(/* @__PURE__ */ new Date(), "yyyy-MM-dd HH:mm:ss.SSS")} =====================

`));
  }
  footer() {
    this.#writer.flush();
    this.#writer.writeSync(Buffer.from(`

===================== LOG END ${(0, import_date_fns2.format)(/* @__PURE__ */ new Date(), "yyyy-MM-dd HH:mm:ss.SSS")} =====================

`));
  }
  #checkLevel(level) {
    const currentLevelPriority = _Logger.LevelPriority[config_default.system.log_level] || 99;
    const levelPriority = _Logger.LevelPriority[level];
    return levelPriority <= currentLevelPriority;
  }
  success(...params) {
    if (!this.#checkLevel(_Logger.Level.Success)) return;
    const content = new LogText(_Logger.Level.Success, ...params).toString();
    console.info(content[_Logger.LevelColor[_Logger.Level.Success]]);
    this.#writer.push(content + "\n");
  }
  info(...params) {
    if (!this.#checkLevel(_Logger.Level.Info)) return;
    const content = new LogText(_Logger.Level.Info, ...params).toString();
    console.info(content[_Logger.LevelColor[_Logger.Level.Info]]);
    this.#writer.push(content + "\n");
  }
  debug(...params) {
    if (!config_default.system.debug) return;
    if (!this.#checkLevel(_Logger.Level.Debug)) return;
    const content = new LogText(_Logger.Level.Debug, ...params).toString();
    console.debug(content[_Logger.LevelColor[_Logger.Level.Debug]]);
    this.#writer.push(content + "\n");
  }
  warn(...params) {
    if (!this.#checkLevel(_Logger.Level.Warning)) return;
    const content = new LogText(_Logger.Level.Warning, ...params).toString();
    console.warn(content[_Logger.LevelColor[_Logger.Level.Warning]]);
    this.#writer.push(content + "\n");
  }
  error(...params) {
    if (!this.#checkLevel(_Logger.Level.Error)) return;
    const content = new LogText(_Logger.Level.Error, ...params).toString();
    console.error(content[_Logger.LevelColor[_Logger.Level.Error]]);
    this.#writer.push(content);
  }
  destory() {
    this.#writer.destory();
  }
};
var logger_default = new Logger();

// src/lib/error-handler.ts
var JimengErrorHandler = class {
  /**
   * 处理即梦API响应错误
   */
  static handleApiResponse(response, options = {}) {
    const { ret, errmsg, historyId } = response;
    const { context = "\u5373\u68A6API\u8BF7\u6C42", operation = "\u64CD\u4F5C" } = options;
    logger_default.error(`${context}\u5931\u8D25: ret=${ret}, errmsg=${errmsg}${historyId ? `, historyId=${historyId}` : ""}`);
    switch (ret) {
      case "1015":
        throw new APIException(exceptions_default.API_TOKEN_EXPIRES, `[\u767B\u5F55\u5931\u6548]: ${errmsg}\u3002\u8BF7\u91CD\u65B0\u83B7\u53D6refresh_token\u5E76\u66F4\u65B0\u914D\u7F6E`);
      case "5000":
        throw new APIException(
          exceptions_default.API_IMAGE_GENERATION_INSUFFICIENT_POINTS,
          `[\u79EF\u5206\u4E0D\u8DB3]: ${errmsg}\u3002\u5EFA\u8BAE\uFF1A1)\u5C1D\u8BD5\u4F7F\u75281024x1024\u5206\u8FA8\u7387\uFF0C2)\u68C0\u67E5\u662F\u5426\u9700\u8981\u8D2D\u4E70\u79EF\u5206\uFF0C3)\u786E\u8BA4\u8D26\u6237\u72B6\u6001\u6B63\u5E38`
        );
      case "4001":
        throw new APIException(exceptions_default.API_CONTENT_FILTERED, `[\u5185\u5BB9\u8FDD\u89C4]: ${errmsg}`);
      case "4002":
        throw new APIException(exceptions_default.API_REQUEST_PARAMS_INVALID, `[\u53C2\u6570\u9519\u8BEF]: ${errmsg}`);
      case "5001":
        throw new APIException(exceptions_default.API_IMAGE_GENERATION_FAILED, `[\u751F\u6210\u5931\u8D25]: ${errmsg}`);
      case "5002":
        throw new APIException(exceptions_default.API_VIDEO_GENERATION_FAILED, `[\u89C6\u9891\u751F\u6210\u5931\u8D25]: ${errmsg}`);
      default:
        throw new APIException(exceptions_default.API_REQUEST_FAILED, `[${operation}\u5931\u8D25]: ${errmsg} (\u9519\u8BEF\u7801: ${ret})`);
    }
  }
  /**
   * 处理网络请求错误
   */
  static handleNetworkError(error, options = {}) {
    var _a2, _b2;
    const { context = "\u7F51\u7EDC\u8BF7\u6C42", retryCount = 0, maxRetries = 3 } = options;
    logger_default.error(`${context}\u7F51\u7EDC\u9519\u8BEF (\u5C1D\u8BD5 ${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
    if (error.code === "ECONNABORTED") {
      throw new APIException(exceptions_default.API_REQUEST_FAILED, `[\u8BF7\u6C42\u8D85\u65F6]: ${context}\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`);
    }
    if (error.code === "ENOTFOUND") {
      throw new APIException(exceptions_default.API_REQUEST_FAILED, `[\u7F51\u7EDC\u9519\u8BEF]: \u65E0\u6CD5\u8FDE\u63A5\u5230\u5373\u68A6\u670D\u52A1\u5668\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5`);
    }
    if (((_a2 = error.response) == null ? void 0 : _a2.status) >= 500) {
      throw new APIException(exceptions_default.API_REQUEST_FAILED, `[\u670D\u52A1\u5668\u9519\u8BEF]: \u5373\u68A6\u670D\u52A1\u5668\u6682\u65F6\u4E0D\u53EF\u7528 (${error.response.status})`);
    }
    if (((_b2 = error.response) == null ? void 0 : _b2.status) === 429) {
      throw new APIException(exceptions_default.API_REQUEST_FAILED, `[\u8BF7\u6C42\u9891\u7387\u9650\u5236]: \u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`);
    }
    throw new APIException(exceptions_default.API_REQUEST_FAILED, `[${context}\u5931\u8D25]: ${error.message}`);
  }
  /**
   * 处理轮询超时错误
   * @returns 如果有部分结果，返回 void 而不抛出异常
   */
  static handlePollingTimeout(pollCount, maxPollCount, elapsedTime, status, itemCount, historyId) {
    const message = `\u8F6E\u8BE2\u8D85\u65F6: \u5DF2\u8F6E\u8BE2 ${pollCount} \u6B21\uFF0C\u8017\u65F6 ${elapsedTime} \u79D2\uFF0C\u6700\u7EC8\u72B6\u6001: ${status}\uFF0C\u56FE\u7247\u6570\u91CF: ${itemCount}`;
    logger_default.warn(message + (historyId ? `\uFF0C\u5386\u53F2ID: ${historyId}` : ""));
    if (itemCount === 0) {
      throw new APIException(
        exceptions_default.API_IMAGE_GENERATION_FAILED,
        `\u751F\u6210\u8D85\u65F6\u4E14\u65E0\u7ED3\u679C\uFF0C\u72B6\u6001\u7801: ${status}${historyId ? `\uFF0C\u5386\u53F2ID: ${historyId}` : ""}`
      );
    }
    logger_default.info(`\u8F6E\u8BE2\u8D85\u65F6\u4F46\u5DF2\u83B7\u5F97 ${itemCount} \u5F20\u56FE\u7247\uFF0C\u5C06\u8FD4\u56DE\u73B0\u6709\u7ED3\u679C`);
  }
  /**
   * 处理生成失败错误
   * @param itemCount 已生成的结果数量，如果 > 0 则不抛出异常
   * @returns 如果有部分结果，返回 false 表示不应抛出异常
   */
  static handleGenerationFailure(status, failCode, historyId, type = "image", itemCount = 0) {
    const typeText = type === "image" ? "\u56FE\u50CF" : "\u89C6\u9891";
    const message = `${typeText}\u751F\u6210\u6700\u7EC8\u5931\u8D25: status=${status}, failCode=${failCode}${historyId ? `, historyId=${historyId}` : ""}, \u5DF2\u751F\u6210\u6570\u91CF=${itemCount}`;
    if (itemCount > 0) {
      logger_default.warn(message);
      logger_default.info(`${typeText}\u751F\u6210\u90E8\u5206\u5931\u8D25\uFF0C\u4F46\u5DF2\u83B7\u5F97 ${itemCount} \u4E2A\u7ED3\u679C\uFF0C\u5C06\u8FD4\u56DE\u73B0\u6709\u7ED3\u679C`);
      return false;
    }
    logger_default.error(message);
    const exception = type === "image" ? exceptions_default.API_IMAGE_GENERATION_FAILED : exceptions_default.API_VIDEO_GENERATION_FAILED;
    throw new APIException(exception, `${typeText}\u751F\u6210\u5931\u8D25\uFF0C\u72B6\u6001\u7801: ${status}${failCode ? `\uFF0C\u9519\u8BEF\u7801: ${failCode}` : ""}`);
  }
  /**
   * 包装重试逻辑的错误处理
   */
  static async withRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 5e3,
      context = "\u64CD\u4F5C",
      operation: operationName = "\u8BF7\u6C42"
    } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (error instanceof APIException) {
          throw error;
        }
        if (attempt < maxRetries) {
          logger_default.warn(`${context}\u5931\u8D25 (\u5C1D\u8BD5 ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
          logger_default.info(`${retryDelay / 1e3}\u79D2\u540E\u91CD\u8BD5...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }
    this.handleNetworkError(lastError, {
      context,
      retryCount: maxRetries,
      maxRetries,
      operation: operationName
    });
  }
};
var handleJimengError = JimengErrorHandler.handleApiResponse;
var handleNetworkError = JimengErrorHandler.handleNetworkError;
var handlePollingTimeout = JimengErrorHandler.handlePollingTimeout;
var handleGenerationFailure = JimengErrorHandler.handleGenerationFailure;
var withRetry = JimengErrorHandler.withRetry;

// src/lib/intl-config.ts
var env = (k) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : void 0;
};
function regionKey(ri) {
  if (ri.isUS) return "us";
  if (ri.isHK) return "hk";
  if (ri.isJP) return "jp";
  if (ri.isSG) return "sg";
  return "cn";
}
var DEFAULT_VOD_HOST_CN = "https://vod.bytedanceapi.com";
var DEFAULT_VOD_HOST_INTL = "https://vod-normal-sg.capcutapi.com";
function getVodHost(ri) {
  const rk = regionKey(ri);
  if (rk === "cn") return env("CN_VOD_HOST") || DEFAULT_VOD_HOST_CN;
  return env(`INTL_VOD_HOST_${rk.toUpperCase()}`) || env("INTL_VOD_HOST") || DEFAULT_VOD_HOST_INTL;
}
function isSeedance2EnabledFor(ri) {
  const rk = regionKey(ri);
  if (rk === "cn") return true;
  const list = (env("INTL_SEEDANCE2_REGIONS") || "us,hk,jp,sg").toLowerCase().split(/[,\s]+/);
  return list.includes(rk);
}
function getModelOverrides(ri) {
  const rk = regionKey(ri);
  const raw = rk === "cn" ? env("CN_VIDEO_MODEL_OVERRIDES") : env(`INTL_VIDEO_MODEL_OVERRIDES_${rk.toUpperCase()}`) || env("INTL_VIDEO_MODEL_OVERRIDES");
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    throw new Error(`\u6A21\u578B\u8986\u76D6\u73AF\u5883\u53D8\u91CF\u4E0D\u662F\u5408\u6CD5 JSON: ${raw}`);
  }
}
function getVideoProfile(ri, defaults) {
  if (ri.isCN) {
    return { ...defaults, videoReferer: "https://jimeng.jianying.com/ai-tool/generate?type=video" };
  }
  return {
    benefitSeedance20Pro: env("INTL_BENEFIT_SEEDANCE20_PRO") || defaults.benefitSeedance20Pro,
    benefitSeedance20Fast: env("INTL_BENEFIT_SEEDANCE20_FAST") || defaults.benefitSeedance20Fast,
    omniBenefitPro: env("INTL_OMNI_BENEFIT_PRO") || defaults.omniBenefitPro,
    omniBenefitFast: env("INTL_OMNI_BENEFIT_FAST") || defaults.omniBenefitFast,
    draftVersion: env("INTL_DRAFT_VERSION") || defaults.draftVersion,
    draftVersionOmni: env("INTL_DRAFT_VERSION_OMNI") || defaults.draftVersionOmni,
    webVersion: env("INTL_WEB_VERSION") || defaults.webVersion,
    videoReferer: env("INTL_VIDEO_REFERER") || "https://dreamina.capcut.com/ai-tool/generate?type=video"
  };
}
var isVideoDebug = () => env("JIMENG_VIDEO_DEBUG") === "1" || env("JIMENG_VIDEO_DEBUG") === "true";
function isAbogusEnabledFor(ri) {
  if (!(env("ABOGUS_BROWSER_ENABLED") === "1" || env("ABOGUS_BROWSER_ENABLED") === "true")) return false;
  const list = (env("ABOGUS_BROWSER_REGIONS") || "us,hk,jp,sg,cn").toLowerCase().split(/[,\s]+/);
  return list.includes(regionKey(ri));
}
function mask(s) {
  const str = String(s ?? "");
  if (str.length <= 8) return "***";
  return `${str.slice(0, 4)}***${str.slice(-2)}`;
}
var SENSITIVE_KEYS = /^(sessionid|sessionid_ss|sid_tt|sid_guard|access_key_id|secret_access_key|session_token|authorization|cookie|token|x-amz-security-token|auth)$/i;
function redact(obj, depth = 0) {
  if (depth > 8 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE_KEYS.test(k) ? mask(v) : redact(v, depth + 1);
    return out;
  }
  return obj;
}

// src/lib/abogus-browser.ts
var overrideRequester = null;
var sessions = /* @__PURE__ */ new Map();
var IDLE_MS = 10 * 60 * 1e3;
function defaultPageUrl(ri) {
  if (process.env.ABOGUS_PAGE_URL) return process.env.ABOGUS_PAGE_URL;
  return ri.isCN ? "https://jimeng.jianying.com/ai-tool/generate?type=video" : "https://dreamina.capcut.com/ai-tool/generate?type=video";
}
function cookieDomains(ri) {
  return ri.isCN ? [".jianying.com"] : [".capcut.com", ".capcutapi.com", ".capcut.us"];
}
async function getSession(req) {
  var _a2;
  const key = `${regionKey(req.regionInfo)}:${req.sessionToken}`;
  const existing = sessions.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }
  let pw;
  try {
    const modName = process.env.ABOGUS_PLAYWRIGHT_MODULE || "playwright-core";
    pw = await import(modName);
  } catch {
    throw new Error("\u5DF2\u5F00\u542F ABOGUS_BROWSER_ENABLED\uFF0C\u4F46\u672A\u5B89\u88C5 playwright-core\u3002\u8BF7\u6267\u884C: npm i playwright-core && npx playwright-core install chromium");
  }
  const chromium = pw.chromium || ((_a2 = pw.default) == null ? void 0 : _a2.chromium);
  const browser = await chromium.launch({
    headless: process.env.ABOGUS_HEADLESS !== "0",
    executablePath: process.env.ABOGUS_BROWSER_EXECUTABLE || void 0,
    ...process.env.INTL_PROXY_URL ? { proxy: { server: process.env.INTL_PROXY_URL } } : {}
  });
  const context = await browser.newContext({
    locale: req.regionInfo.isCN ? "zh-CN" : "en-US",
    userAgent: process.env.ABOGUS_USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
  });
  await context.addCookies(cookieDomains(req.regionInfo).flatMap((domain) => ["sessionid", "sessionid_ss", "sid_tt"].map((name) => ({ name, value: req.sessionToken, domain, path: "/", secure: true, httpOnly: true, sameSite: "None" }))));
  const page = await context.newPage();
  if (process.env.ABOGUS_DRY_RUN === "1") {
    await page.route("**/aigc_draft/generate**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ret: "0", data: { aigc_data: { history_record_id: "" } }, dry_run: true }) }));
    logger_default.warn("[abogus] ABOGUS_DRY_RUN=1\uFF1A\u751F\u6210\u8BF7\u6C42\u4E0D\u4F1A\u53D1\u5F80\u670D\u52A1\u5668");
  }
  const pageUrl = defaultPageUrl(req.regionInfo);
  logger_default.info(`[abogus] \u542F\u52A8\u6D4F\u89C8\u5668\u4F1A\u8BDD region=${regionKey(req.regionInfo)} page=${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 6e4 });
  try {
    await page.waitForFunction(() => !!(window.__ac_intercepted_fetch || window.byted_acrawler), null, { timeout: 3e4 });
    logger_default.info("[abogus] \u68C0\u6D4B\u5230\u98CE\u63A7 SDK \u5DF2\u52A0\u8F7D");
  } catch {
    logger_default.warn("[abogus] 30s \u5185\u672A\u68C0\u6D4B\u5230\u98CE\u63A7 SDK\uFF0C\u8BF7\u6C42\u53EF\u80FD\u4E0D\u4F1A\u88AB\u7B7E\u540D");
  }
  await page.waitForTimeout(Number(process.env.ABOGUS_WARMUP_MS || 8e3));
  const s = { browser, context, page, lastUsed: Date.now() };
  sessions.set(key, s);
  return s;
}
var _a, _b;
(_b = (_a = setInterval(async () => {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.lastUsed > IDLE_MS) {
      sessions.delete(k);
      try {
        await s.browser.close();
      } catch {
      }
    }
  }
}, 6e4)).unref) == null ? void 0 : _b.call(_a);
var PASS_HEADERS = /^(pf|appvr|lan|sign|sign-ver|device-time|app-sdk-version|accept)$/i;
async function browserRequest(req) {
  if (overrideRequester) return overrideRequester(req);
  const s = await getSession(req);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (PASS_HEADERS.test(k) && v != null) headers[k] = String(v);
  headers["Content-Type"] = "application/json";
  logger_default.info(`[abogus] \u901A\u8FC7\u6D4F\u89C8\u5668\u53D1\u9001: ${req.method.toUpperCase()} ${req.url.split("?")[0]} headers=${Object.keys(headers).join(",")}`);
  const onReq = (r) => {
    if (!r.url().startsWith(req.url.split("?")[0])) return;
    const u = new URL(r.url());
    logger_default.info(`[abogus] \u5B9E\u9645\u53D1\u51FA: ${u.origin}${u.pathname} \u7B7E\u540D\u53C2\u6570: ${["msToken", "X-Bogus", "X-Gnarly", "a_bogus"].map((k) => `${k}=${(u.searchParams.get(k) || "").length}`).join(" ")} \u5934: ${Object.keys(r.headers()).join(",")}`);
  };
  s.page.on("request", onReq);
  try {
    return await s.page.evaluate(async ({ url, method, headers: headers2, body }) => {
      const r = await fetch(url, { method, headers: headers2, body, credentials: "include", signal: AbortSignal.timeout(9e4) });
      const text = await r.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch {
      }
      return { status: r.status, statusText: r.statusText, data };
    }, { url: req.url, method: req.method.toUpperCase(), headers, body: req.data == null ? void 0 : JSON.stringify(req.data) });
  } finally {
    s.page.off("request", onReq);
  }
}
async function closeAllBrowserSessions() {
  for (const [k, s] of sessions) {
    sessions.delete(k);
    try {
      await s.browser.close();
    } catch {
    }
  }
}

// src/api/consts/dreamina.ts
var BASE_URL_DREAMINA_US = "https://dreamina-api.us.capcut.com";
var BASE_URL_IMAGEX_US = "https://imagex16-normal-us-ttp.capcutapi.us";
var BASE_URL_DREAMINA_HK = "https://mweb-api-sg.capcut.com";
var BASE_URL_IMAGEX_HK = "https://imagex-normal-sg.capcutapi.com";
var WEB_VERSION = "7.5.0";
var DA_VERSION = "3.3.9";

// src/api/consts/common.ts
var BASE_URL_CN = "https://jimeng.jianying.com";
var BASE_URL_US_COMMERCE = "https://commerce.us.capcut.com";
var BASE_URL_HK_COMMERCE = "https://commerce-api-sg.capcut.com";
var DEFAULT_ASSISTANT_ID_CN = 513695;
var DEFAULT_ASSISTANT_ID_US = 513641;
var DEFAULT_ASSISTANT_ID_HK = 513641;
var DEFAULT_ASSISTANT_ID_JP = 513641;
var DEFAULT_ASSISTANT_ID_SG = 513641;
var REGION_CN = "cn";
var REGION_US = "US";
var REGION_HK = "HK";
var REGION_JP = "JP";
var REGION_SG = "SG";
var PLATFORM_CODE = "7";
var VERSION_CODE = "8.4.0";
var DEFAULT_VIDEO_MODEL = "jimeng-video-3.5-pro";
var DRAFT_VERSION = "3.3.9";
var DRAFT_VERSION_OMNI = "3.3.9";
var OMNI_BENEFIT_TYPE = "dreamina_video_seedance_20_video_add";
var OMNI_BENEFIT_TYPE_FAST = "dreamina_seedance_20_fast_with_video";
var VIDEO_MODEL_MAP = {
  "jimeng-video-seedance-2.0": "dreamina_seedance_40_pro",
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_40",
  "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
  "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
  "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
  "jimeng-video-3.0-fast": "dreamina_ic_generate_video_model_vgfm_3.0_fast",
  "jimeng-video-2.0": "dreamina_ic_generate_video_model_vgfm_lite",
  "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0"
};
var VIDEO_MODEL_MAP_US = {
  "jimeng-video-seedance-2.0": "dreamina_seedance_40_pro",
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_40",
  "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
  "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0"
};
var VIDEO_MODEL_MAP_ASIA = {
  "jimeng-video-seedance-2.0": "dreamina_seedance_40_pro",
  "jimeng-video-seedance-2.0-fast": "dreamina_seedance_40",
  "jimeng-video-veo3": "dreamina_veo3_generate_video",
  "jimeng-video-veo3.1": "dreamina_veo3.1_generate_video",
  "jimeng-video-sora2": "dreamina_sora2_generate_video",
  "jimeng-video-3.5-pro": "dreamina_ic_generate_video_model_vgfm_3.5_pro",
  "jimeng-video-3.0-pro": "dreamina_ic_generate_video_model_vgfm_3.0_pro",
  "jimeng-video-3.0": "dreamina_ic_generate_video_model_vgfm_3.0",
  "jimeng-video-3.0-fast": "dreamina_ic_generate_video_model_vgfm_3.0_fast",
  "jimeng-video-2.0": "dreamina_ic_generate_video_model_vgfm_lite",
  "jimeng-video-2.0-pro": "dreamina_ic_generate_video_model_vgfm1.0"
};
var STATUS_CODE_MAP = {
  20: "PROCESSING",
  10: "SUCCESS",
  30: "FAILED",
  42: "POST_PROCESSING",
  45: "FINALIZING",
  50: "COMPLETED"
};
var RETRY_CONFIG = {
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY: 5e3
};
var POLLING_CONFIG = {
  MAX_POLL_COUNT: 900,
  // 最大轮询次数
  POLL_INTERVAL: 5e3,
  // 轮询间隔 5 秒
  STABLE_ROUNDS: 5,
  // 稳定轮次
  TIMEOUT_SECONDS: 900
  // 默认超时 15 分钟
};

// src/api/controllers/core.ts
var DEVICE_ID = Math.random() * 1e18 + 7e18;
var WEB_ID = Math.random() * 1e18 + 7e18;
var USER_ID = util_default.uuid(false);
var FAKE_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-language": "zh-CN,zh;q=0.9",
  "Cache-control": "no-cache",
  Appvr: VERSION_CODE,
  Pragma: "no-cache",
  Priority: "u=1, i",
  Pf: PLATFORM_CODE,
  "Sec-Ch-Ua": '"Google Chrome";v="142", "Chromium";v="142", "Not_A Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
};
var FILE_MAX_SIZE = 100 * 1024 * 1024;
async function acquireToken(refreshToken) {
  return refreshToken;
}
function parseProxyFromToken(rawToken) {
  const tokenValue = rawToken.trim();
  const proxyPattern = /^(https?|socks(?:4|5)?):\/\//i;
  if (!proxyPattern.test(tokenValue)) return { token: tokenValue, proxyUrl: null };
  const lastAtIndex = tokenValue.lastIndexOf("@");
  if (lastAtIndex <= 0 || lastAtIndex === tokenValue.length - 1)
    return { token: tokenValue, proxyUrl: null };
  const proxyUrl = tokenValue.slice(0, lastAtIndex);
  const token = tokenValue.slice(lastAtIndex + 1);
  if (!proxyUrl || !token) return { token: tokenValue, proxyUrl: null };
  return { token, proxyUrl };
}
function parseRegionFromToken(refreshToken) {
  const { token: parsedToken } = parseProxyFromToken(refreshToken);
  const token = parsedToken.toLowerCase();
  const isUS = token.startsWith("us-");
  const isHK = token.startsWith("hk-");
  const isJP = token.startsWith("jp-");
  const isSG = token.startsWith("sg-");
  const isInternational = isUS || isHK || isJP || isSG;
  return {
    isUS,
    isHK,
    isJP,
    isSG,
    isInternational,
    isCN: !isInternational
  };
}
function getRefererByRegion(refreshToken, cnPath) {
  const { isInternational } = parseRegionFromToken(refreshToken);
  return isInternational ? "https://dreamina.capcut.com/" : `https://jimeng.jianying.com${cnPath}`;
}
function getAssistantId(regionInfo) {
  if (regionInfo.isUS) return DEFAULT_ASSISTANT_ID_US;
  if (regionInfo.isJP) return DEFAULT_ASSISTANT_ID_JP;
  if (regionInfo.isSG) return DEFAULT_ASSISTANT_ID_SG;
  if (regionInfo.isHK) return DEFAULT_ASSISTANT_ID_HK;
  return DEFAULT_ASSISTANT_ID_CN;
}
function generateCookie(refreshToken) {
  const { token: tokenWithRegion } = parseProxyFromToken(refreshToken);
  const { isUS, isHK, isJP, isSG } = parseRegionFromToken(tokenWithRegion);
  const token = isUS || isHK || isJP || isSG ? tokenWithRegion.substring(3) : tokenWithRegion;
  return [
    `_tea_web_id=${WEB_ID}`,
    `is_staff_user=false`,
    `sid_guard=${token}%7C${util_default.unixTimestamp()}%7C5184000%7CMon%2C+03-Feb-2025+08%3A17%3A09+GMT`,
    `uid_tt=${USER_ID}`,
    `uid_tt_ss=${USER_ID}`,
    `sid_tt=${token}`,
    `sessionid=${token}`,
    `sessionid_ss=${token}`
  ].join("; ");
}
async function getCredit(refreshToken) {
  const referer = getRefererByRegion(refreshToken, "/ai-tool/image/generate");
  const {
    credit: { gift_credit, purchase_credit, vip_credit }
  } = await request("POST", "/commerce/v1/benefits/user_credit", refreshToken, {
    data: {},
    headers: {
      Referer: referer
    },
    noDefaultParams: true
  });
  logger_default.info(`
\u79EF\u5206\u4FE1\u606F: 
\u8D60\u9001\u79EF\u5206: ${gift_credit}, \u8D2D\u4E70\u79EF\u5206: ${purchase_credit}, VIP\u79EF\u5206: ${vip_credit}`);
  return {
    giftCredit: gift_credit,
    purchaseCredit: purchase_credit,
    vipCredit: vip_credit,
    totalCredit: gift_credit + purchase_credit + vip_credit
  };
}
async function receiveCredit(refreshToken) {
  logger_default.info("\u6B63\u5728\u5C1D\u8BD5\u6536\u53D6\u4ECA\u65E5\u79EF\u5206...");
  const referer = getRefererByRegion(refreshToken, "/ai-tool/home");
  const { receive_quota } = await request("POST", "/commerce/v1/benefits/credit_receive", refreshToken, {
    data: {
      time_zone: "Asia/Shanghai"
    },
    headers: {
      Referer: referer
    }
  });
  logger_default.info(`\u4ECA\u65E5${receive_quota}\u79EF\u5206\u6536\u53D6\u6210\u529F`);
  return receive_quota;
}
async function request(method, uri, refreshToken, options = {}) {
  const parsedProxy = parseProxyFromToken(refreshToken);
  const tokenWithRegion = parsedProxy.token;
  const proxyUrl = parsedProxy.proxyUrl || process.env.INTL_PROXY_URL;
  const regionInfo = parseRegionFromToken(tokenWithRegion);
  const { isUS, isHK, isJP, isSG } = regionInfo;
  await acquireToken(regionInfo.isInternational ? tokenWithRegion.substring(3) : tokenWithRegion);
  const deviceTime = util_default.unixTimestamp();
  const sign = util_default.md5(
    `9e2c|${uri.slice(-7)}|${PLATFORM_CODE}|${VERSION_CODE}|${deviceTime}||11ac`
  );
  let baseUrl;
  let aid;
  let region;
  if (isUS) {
    if (uri.startsWith("/commerce/")) {
      baseUrl = BASE_URL_US_COMMERCE;
    } else {
      baseUrl = BASE_URL_DREAMINA_US;
    }
    aid = DEFAULT_ASSISTANT_ID_US;
    region = REGION_US;
  } else if (isHK || isJP || isSG) {
    if (uri.startsWith("/commerce/")) {
      baseUrl = BASE_URL_HK_COMMERCE;
    } else {
      baseUrl = BASE_URL_DREAMINA_HK;
    }
    if (isJP) {
      aid = DEFAULT_ASSISTANT_ID_JP;
      region = REGION_JP;
    } else if (isSG) {
      aid = DEFAULT_ASSISTANT_ID_SG;
      region = REGION_SG;
    } else {
      aid = DEFAULT_ASSISTANT_ID_HK;
      region = REGION_HK;
    }
  } else {
    baseUrl = BASE_URL_CN;
    aid = DEFAULT_ASSISTANT_ID_CN;
    region = REGION_CN;
  }
  if (regionInfo.isInternational) {
    const rk = regionKey(regionInfo).toUpperCase();
    const isCommerce = uri.startsWith("/commerce/");
    const ov = isCommerce ? process.env[`INTL_COMMERCE_BASE_URL_${rk}`] || process.env.INTL_COMMERCE_BASE_URL : process.env[`INTL_API_BASE_URL_${rk}`] || process.env.INTL_API_BASE_URL;
    if (ov && ov.trim()) baseUrl = ov.trim().replace(/\/$/, "");
  }
  const origin = new URL(baseUrl).origin;
  const fullUrl = `${baseUrl}${uri}`;
  const requestParams = options.noDefaultParams ? options.params || {} : {
    aid,
    device_platform: "web",
    region,
    ...isUS || isHK || isJP || isSG ? {} : { webId: WEB_ID },
    da_version: DA_VERSION,
    os: "windows",
    web_component_open_flag: 1,
    web_version: WEB_VERSION,
    aigc_features: "app_lip_sync",
    ...options.params || {}
  };
  const headers = {
    ...FAKE_HEADERS,
    Origin: origin,
    Referer: origin,
    "App-Sdk-Version": "48.0.0",
    Appid: aid,
    Cookie: generateCookie(tokenWithRegion),
    "Device-Time": deviceTime,
    Lan: isUS ? "en" : isJP ? "ja" : isHK || isSG ? "en" : "zh-Hans",
    Loc: isUS ? "us" : isJP ? "jp" : isHK ? "hk" : isSG ? "sg" : "cn",
    Sign: sign,
    "Sign-Ver": "1",
    Tdid: "",
    ...options.headers || {}
  };
  logger_default.info(`\u53D1\u9001\u8BF7\u6C42: ${method.toUpperCase()} ${fullUrl}`);
  if (proxyUrl) {
    const maskedProxyUrl = proxyUrl.replace(/\/\/([^@/]+)@/i, "//***@");
    logger_default.info(`\u4F7F\u7528\u4EE3\u7406: ${maskedProxyUrl}`);
  }
  logger_default.info(`\u8BF7\u6C42\u53C2\u6570: ${JSON.stringify(redact(requestParams))}`);
  logger_default.info(`\u8BF7\u6C42\u6570\u636E: ${JSON.stringify(redact(options.data || {}))}`);
  if (options.useAbogusBrowser && isAbogusEnabledFor(regionInfo)) {
    const qs = new URLSearchParams(Object.entries(requestParams).map(([k, v]) => [k, String(v)])).toString();
    const sessionToken = regionInfo.isInternational ? tokenWithRegion.substring(3) : tokenWithRegion;
    logger_default.info(`[abogus] \u5DF2\u542F\u7528\u6D4F\u89C8\u5668\u7B7E\u540D\u901A\u9053 region=${regionKey(regionInfo)} uri=${uri}`);
    const br = await browserRequest({
      method,
      url: qs ? `${fullUrl}?${qs}` : fullUrl,
      headers: import_lodash7.default.omit(headers, "Cookie"),
      data: options.data,
      regionInfo,
      sessionToken
    });
    logger_default.info(`[abogus] \u54CD\u5E94\u72B6\u6001: ${br.status}\uFF0C\u6458\u8981: ${JSON.stringify(redact(br.data)).substring(0, 500)}`);
    return checkResult({ status: br.status, statusText: br.statusText, data: br.data, headers: {}, config: {} });
  }
  const proxyAgent = proxyUrl ? proxyUrl.toLowerCase().startsWith("socks") ? new import_socks_proxy_agent.SocksProxyAgent(proxyUrl) : new import_https_proxy_agent.HttpsProxyAgent(proxyUrl) : void 0;
  let retries = 0;
  const maxRetries = RETRY_CONFIG.MAX_RETRY_COUNT;
  let lastError = null;
  while (retries <= maxRetries) {
    try {
      if (retries > 0) {
        logger_default.info(`\u7B2C ${retries} \u6B21\u91CD\u8BD5\u8BF7\u6C42: ${method.toUpperCase()} ${fullUrl}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_CONFIG.RETRY_DELAY));
      }
      const response = await import_axios2.default.request({
        method,
        url: fullUrl,
        params: requestParams,
        headers,
        timeout: 45e3,
        // 增加超时时间到45秒
        validateStatus: () => true,
        // 允许任何状态码
        ...import_lodash7.default.omit(options, "params", "headers", "noDefaultParams", "useAbogusBrowser"),
        ...proxyAgent ? { httpAgent: proxyAgent, httpsAgent: proxyAgent, proxy: false } : {}
      });
      logger_default.info(`\u54CD\u5E94\u72B6\u6001: ${response.status} ${response.statusText}`);
      if (options.responseType == "stream") return response;
      const redactedData = JSON.stringify(redact(response.data)) || "";
      const responseDataSummary = redactedData.substring(0, 500) + (redactedData.length > 500 ? "..." : "");
      logger_default.info(`\u54CD\u5E94\u6570\u636E\u6458\u8981: ${responseDataSummary}`);
      if (response.status >= 400) {
        logger_default.warn(`HTTP\u9519\u8BEF: ${response.status} ${response.statusText}`);
        if (retries < maxRetries) {
          retries++;
          continue;
        }
      }
      return checkResult(response);
    } catch (error) {
      lastError = error;
      logger_default.error(`\u8BF7\u6C42\u5931\u8D25 (\u5C1D\u8BD5 ${retries + 1}/${maxRetries + 1}): ${error.message}`);
      const retryableErrorCodes = [
        "ECONNABORTED",
        "ETIMEDOUT",
        "ECONNRESET",
        "ENOTFOUND",
        "ECONNREFUSED",
        "EAI_AGAIN",
        "EPIPE",
        "ENETUNREACH",
        "EHOSTUNREACH"
      ];
      const isRetryableError = retryableErrorCodes.includes(error.code) || error.message.includes("timeout") || error.message.includes("network") || error.message.includes("ECONNRESET") || error.message.includes("socket hang up") || error.message.includes("Proxy connection");
      if (isRetryableError && retries < maxRetries) {
        retries++;
        continue;
      }
      break;
    }
  }
  if (lastError) {
    logger_default.error(`\u8BF7\u6C42\u5931\u8D25\uFF0C\u5DF2\u91CD\u8BD5 ${retries} \u6B21: ${lastError.message}`);
    if (lastError.response) {
      logger_default.error(`\u54CD\u5E94\u72B6\u6001: ${lastError.response.status}`);
      logger_default.error(`\u54CD\u5E94\u6570\u636E: ${JSON.stringify(redact(lastError.response.data))}`);
    }
    throw lastError;
  } else {
    const error = new Error(`\u8BF7\u6C42\u5931\u8D25\uFF0C\u5DF2\u91CD\u8BD5 ${retries} \u6B21\uFF0C\u4F46\u6CA1\u6709\u5177\u4F53\u9519\u8BEF\u4FE1\u606F`);
    logger_default.error(error.message);
    throw error;
  }
}
async function checkImageContent(imageUri, refreshToken, regionInfo) {
  if (regionInfo.isInternational) return;
  const babiParam = JSON.stringify({
    scenario: "image_video_generation",
    feature_key: "aigc_to_image",
    feature_entrance: "to-generate",
    feature_entrance_detail: "to-generate-algo_proxy"
  });
  logger_default.info(`\u5F00\u59CB\u56FE\u7247\u5185\u5BB9\u5B89\u5168\u68C0\u6D4B: ${imageUri}`);
  try {
    await request("post", "/mweb/v1/algo_proxy", refreshToken, {
      params: {
        babi_param: babiParam
      },
      data: {
        scene: "image_face_ip",
        options: { ip_check: true },
        req_key: "benchmark_test_user_upload_image_input",
        file_list: [{ file_uri: imageUri }],
        req_params: {}
      }
    });
    logger_default.info(`\u56FE\u7247\u5185\u5BB9\u5B89\u5168\u68C0\u6D4B\u901A\u8FC7: ${imageUri}`);
  } catch (error) {
    const isContentViolation = error.message && (error.message.includes("2003") || error.message.includes("risk not pass") || error.message.includes("detected risk"));
    if (isContentViolation) {
      logger_default.error(`\u56FE\u7247\u5185\u5BB9\u5B89\u5168\u68C0\u6D4B\u672A\u901A\u8FC7: ${imageUri}, ${error.message}`);
      throw new APIException(
        exceptions_default.API_REQUEST_FAILED,
        `\u56FE\u7247\u5185\u5BB9\u68C0\u6D4B\u672A\u901A\u8FC7\uFF0C\u8BE5\u56FE\u7247\u53EF\u80FD\u5305\u542B\u8FDD\u89C4\u5185\u5BB9`
      );
    }
    logger_default.warn(`\u56FE\u7247\u5185\u5BB9\u5B89\u5168\u68C0\u6D4B\u670D\u52A1\u5F02\u5E38(\u4E0D\u963B\u585E): ${imageUri}, ${error.message}`);
  }
}
function checkResult(result) {
  const { ret, errmsg, data } = result.data;
  if (!import_lodash7.default.isFinite(Number(ret))) return result.data;
  if (ret === "0") return data;
  JimengErrorHandler.handleApiResponse(result.data, {
    context: "\u5373\u68A6API\u8BF7\u6C42",
    operation: "\u8BF7\u6C42"
  });
}

// src/lib/smart-poller.ts
var SmartPoller = class {
  pollCount = 0;
  startTime = Date.now();
  lastItemCount = 0;
  stableItemCountRounds = 0;
  options;
  constructor(options = {}) {
    this.options = {
      maxPollCount: options.maxPollCount ?? POLLING_CONFIG.MAX_POLL_COUNT,
      pollInterval: options.pollInterval ?? POLLING_CONFIG.POLL_INTERVAL,
      stableRounds: options.stableRounds ?? POLLING_CONFIG.STABLE_ROUNDS,
      timeoutSeconds: options.timeoutSeconds ?? POLLING_CONFIG.TIMEOUT_SECONDS,
      expectedItemCount: options.expectedItemCount ?? 4,
      type: options.type ?? "image"
    };
  }
  /**
   * 获取状态名称
   */
  getStatusName(status) {
    return STATUS_CODE_MAP[status] || `UNKNOWN(${status})`;
  }
  /**
   * 根据状态码计算智能轮询间隔
   */
  getSmartInterval(status, itemCount) {
    const baseInterval = this.options.pollInterval;
    switch (status) {
      case 20:
        return baseInterval;
      case 42:
        return baseInterval * 1.2;
      case 45:
        return baseInterval * 1.5;
      case 50:
        return baseInterval * 0.5;
      case 10:
        return 0;
      case 30:
        return 0;
      default:
        return baseInterval;
    }
  }
  /**
   * 检查是否应该退出轮询
   */
  shouldExitPolling(pollingStatus) {
    const { status, itemCount } = pollingStatus;
    const elapsedTime = Math.round((Date.now() - this.startTime) / 1e3);
    if (itemCount === this.lastItemCount) {
      this.stableItemCountRounds++;
    } else {
      this.stableItemCountRounds = 0;
      this.lastItemCount = itemCount;
    }
    if (status === 10 || status === 50) {
      return { shouldExit: true, reason: "\u4EFB\u52A1\u6210\u529F\u5B8C\u6210" };
    }
    if (status === 30) {
      return { shouldExit: true, reason: "\u4EFB\u52A1\u5931\u8D25" };
    }
    if (itemCount >= this.options.expectedItemCount && (status === 10 || status === 50)) {
      return { shouldExit: true, reason: `\u5DF2\u83B7\u5F97\u5B8C\u6574\u7ED3\u679C\u96C6(${itemCount}/${this.options.expectedItemCount})` };
    }
    if (this.stableItemCountRounds >= this.options.stableRounds && itemCount > 0) {
      return { shouldExit: true, reason: `\u7ED3\u679C\u6570\u91CF\u7A33\u5B9A(${this.stableItemCountRounds}\u8F6E)` };
    }
    if (this.pollCount >= this.options.maxPollCount) {
      return { shouldExit: true, reason: "\u8F6E\u8BE2\u6B21\u6570\u8D85\u9650" };
    }
    if (elapsedTime >= this.options.timeoutSeconds && itemCount > 0) {
      return { shouldExit: true, reason: "\u65F6\u95F4\u8D85\u9650\u4F46\u5DF2\u6709\u7ED3\u679C" };
    }
    return { shouldExit: false, reason: "" };
  }
  /**
   * 执行单次轮询检查
   */
  async poll(pollFunction, historyId) {
    var _a2, _b2, _c, _d, _e;
    logger_default.info(`\u5F00\u59CB\u667A\u80FD\u8F6E\u8BE2: historyId=${historyId || "N/A"}, \u6700\u5927\u8F6E\u8BE2\u6B21\u6570=${this.options.maxPollCount}, \u671F\u671B\u7ED3\u679C\u6570=${this.options.expectedItemCount}`);
    let lastData;
    let lastStatus = { status: 20, itemCount: 0 };
    while (true) {
      this.pollCount++;
      const elapsedTime = Math.round((Date.now() - this.startTime) / 1e3);
      try {
        const { status, data } = await pollFunction();
        lastStatus = status;
        lastData = data;
        logger_default.info(`\u8F6E\u8BE2 ${this.pollCount}/${this.options.maxPollCount}: status=${status.status}(${this.getStatusName(status.status)}), failCode=${status.failCode || "none"}, items=${status.itemCount}, elapsed=${elapsedTime}s, finish_time=${status.finishTime || 0}, stable=${this.stableItemCountRounds}/${this.options.stableRounds}`);
        if (status.itemCount > 0) {
          logger_default.info(`\u68C0\u6D4B\u5230${this.options.type === "image" ? "\u56FE\u7247" : "\u89C6\u9891"}\u751F\u6210: \u6570\u91CF=${status.itemCount}, \u72B6\u6001=${this.getStatusName(status.status)}`);
        }
        const { shouldExit, reason } = this.shouldExitPolling(status);
        if (shouldExit) {
          logger_default.info(`\u9000\u51FA\u8F6E\u8BE2: ${reason}, \u6700\u7EC8${this.options.type === "image" ? "\u56FE\u7247" : "\u89C6\u9891"}\u6570\u91CF=${status.itemCount}`);
          if (status.status === 30) {
            handleGenerationFailure(status.status, status.failCode, historyId, this.options.type, status.itemCount);
          }
          if (reason === "\u8F6E\u8BE2\u6B21\u6570\u8D85\u9650" || reason === "\u65F6\u95F4\u8D85\u9650\u4F46\u5DF2\u6709\u7ED3\u679C") {
            handlePollingTimeout(
              this.pollCount,
              this.options.maxPollCount,
              elapsedTime,
              status.status,
              status.itemCount,
              historyId
            );
          }
          break;
        }
        if (![20, 42, 45, 10, 30, 50].includes(status.status)) {
          logger_default.warn(`\u68C0\u6D4B\u5230\u672A\u77E5\u72B6\u6001\u7801 ${status.status}(${this.getStatusName(status.status)})\uFF0C\u7EE7\u7EED\u8F6E\u8BE2\u7B49\u5F85\u751F\u6210...`);
        }
        if (this.pollCount % 30 === 0) {
          logger_default.info(`${this.options.type === "image" ? "\u56FE\u50CF" : "\u89C6\u9891"}\u751F\u6210\u8FDB\u5EA6: \u7B2C ${this.pollCount} \u6B21\u8F6E\u8BE2\uFF0C\u72B6\u6001: ${this.getStatusName(status.status)}\uFF0C\u5DF2\u7B49\u5F85 ${elapsedTime} \u79D2...`);
        }
        const nextInterval = this.getSmartInterval(status.status, status.itemCount);
        if (nextInterval > 0) {
          await new Promise((resolve) => setTimeout(resolve, nextInterval));
        }
      } catch (error) {
        const retryableErrorCodes = [
          "ECONNABORTED",
          "ETIMEDOUT",
          "ECONNRESET",
          "ENOTFOUND",
          "ECONNREFUSED",
          "EAI_AGAIN",
          "EPIPE",
          "ENETUNREACH",
          "EHOSTUNREACH"
        ];
        const isRetryableError = retryableErrorCodes.includes(error.code) || ((_a2 = error.message) == null ? void 0 : _a2.includes("timeout")) || ((_b2 = error.message) == null ? void 0 : _b2.includes("network")) || ((_c = error.message) == null ? void 0 : _c.includes("ECONNRESET")) || ((_d = error.message) == null ? void 0 : _d.includes("socket hang up")) || ((_e = error.message) == null ? void 0 : _e.includes("Proxy connection"));
        if (isRetryableError && this.pollCount < this.options.maxPollCount) {
          logger_default.warn(`\u8F6E\u8BE2\u8FC7\u7A0B\u4E2D\u53D1\u751F\u7F51\u7EDC\u9519\u8BEF (${error.code || error.message})\uFF0C\u7B49\u5F85\u540E\u7EE7\u7EED\u8F6E\u8BE2...`);
          await new Promise((resolve) => setTimeout(resolve, this.options.pollInterval));
          continue;
        }
        logger_default.error(`\u8F6E\u8BE2\u8FC7\u7A0B\u4E2D\u53D1\u751F\u4E0D\u53EF\u6062\u590D\u7684\u9519\u8BEF: ${error.message}`);
        throw error;
      }
    }
    const finalElapsedTime = Math.round((Date.now() - this.startTime) / 1e3);
    const result = {
      status: lastStatus.status,
      failCode: lastStatus.failCode,
      itemCount: lastStatus.itemCount,
      elapsedTime: finalElapsedTime,
      pollCount: this.pollCount,
      exitReason: this.shouldExitPolling(lastStatus).reason
    };
    logger_default.info(`${this.options.type === "image" ? "\u56FE\u50CF" : "\u89C6\u9891"}\u751F\u6210\u5B8C\u6210: \u6210\u529F\u751F\u6210 ${lastStatus.itemCount} \u4E2A\u7ED3\u679C\uFF0C\u603B\u8017\u65F6 ${finalElapsedTime} \u79D2\uFF0C\u6700\u7EC8\u72B6\u6001: ${this.getStatusName(lastStatus.status)}`);
    return { result, data: lastData };
  }
};

// src/lib/image-uploader.ts
var import_crypto3 = __toESM(require("crypto"), 1);
var import_axios3 = __toESM(require("axios"), 1);

// src/lib/region-utils.ts
var RegionUtils = class {
  /**
   * 获取ServiceId
   */
  static getServiceId(regionInfo, providedServiceId) {
    if (providedServiceId) {
      return providedServiceId;
    }
    if (regionInfo.isUS || regionInfo.isHK || regionInfo.isJP || regionInfo.isSG) {
      return "wopfjsm1ax";
    }
    return "tb4s082cfz";
  }
  /**
   * 获取ImageX URL
   */
  static getImageXUrl(regionInfo) {
    if (regionInfo.isUS) {
      return BASE_URL_IMAGEX_US;
    }
    if (regionInfo.isHK || regionInfo.isJP || regionInfo.isSG) {
      return BASE_URL_IMAGEX_HK;
    }
    return "https://imagex.bytedanceapi.com";
  }
  /**
   * 获取Origin
   */
  static getOrigin(regionInfo) {
    if (regionInfo.isUS) {
      return new URL(BASE_URL_DREAMINA_US).origin;
    }
    if (regionInfo.isHK || regionInfo.isJP || regionInfo.isSG) {
      return new URL(BASE_URL_DREAMINA_HK).origin;
    }
    return "https://jimeng.jianying.com";
  }
  /**
   * 获取AWS区域
   */
  static getAWSRegion(regionInfo) {
    if (regionInfo.isUS) {
      return "us-east-1";
    }
    if (regionInfo.isHK || regionInfo.isJP || regionInfo.isSG) {
      return "ap-southeast-1";
    }
    return "cn-north-1";
  }
  /**
   * 获取Referer路径
   */
  static getRefererPath(regionInfo, path6 = "/ai-tool/generate") {
    const origin = this.getOrigin(regionInfo);
    return `${origin}${path6}`;
  }
  /**
   * 获取视频上传 VOD 域名（国内 vod.bytedanceapi.com；国际版默认 vod-normal-sg.capcutapi.com）
   * 环境变量覆盖：CN_VOD_HOST / INTL_VOD_HOST / INTL_VOD_HOST_US|HK|JP|SG
   */
  static getVodHost(regionInfo) {
    return getVodHost(regionInfo);
  }
};

// src/lib/aws-signature.ts
var import_crypto2 = __toESM(require("crypto"), 1);
function createSignature(method, url, headers, accessKeyId, secretAccessKey, sessionToken, payload = "", region = "cn-north-1", service = "imagex") {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname || "/";
  const search = urlObj.search;
  const timestamp = headers["x-amz-date"];
  const date = timestamp.substr(0, 8);
  const queryParams = [];
  const searchParams = new URLSearchParams(search);
  searchParams.forEach((value, key) => {
    queryParams.push([key, value]);
  });
  queryParams.sort(([a], [b]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const canonicalQueryString = queryParams.map(([key, value]) => `${key}=${value}`).join("&");
  const headersToSign = {
    "x-amz-date": timestamp
  };
  if (sessionToken) {
    headersToSign["x-amz-security-token"] = sessionToken;
  }
  let payloadHash = import_crypto2.default.createHash("sha256").update("").digest("hex");
  if (method.toUpperCase() === "POST" && payload) {
    payloadHash = import_crypto2.default.createHash("sha256").update(payload, "utf8").digest("hex");
    headersToSign["x-amz-content-sha256"] = payloadHash;
  }
  const signedHeaders = Object.keys(headersToSign).map((key) => key.toLowerCase()).sort().join(";");
  const canonicalHeaders = Object.keys(headersToSign).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((key) => `${key.toLowerCase()}:${headersToSign[key].trim()}
`).join("");
  const canonicalRequest = [
    method.toUpperCase(),
    pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    credentialScope,
    import_crypto2.default.createHash("sha256").update(canonicalRequest, "utf8").digest("hex")
  ].join("\n");
  const kDate = import_crypto2.default.createHmac("sha256", `AWS4${secretAccessKey}`).update(date).digest();
  const kRegion = import_crypto2.default.createHmac("sha256", kDate).update(region).digest();
  const kService = import_crypto2.default.createHmac("sha256", kRegion).update(service).digest();
  const kSigning = import_crypto2.default.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = import_crypto2.default.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// src/lib/image-uploader.ts
async function uploadImageBuffer(imageBuffer, refreshToken, regionInfo) {
  var _a2, _b2, _c, _d, _e, _f;
  try {
    logger_default.info(`\u5F00\u59CB\u4E0A\u4F20\u56FE\u7247Buffer... (isInternational: ${regionInfo.isInternational})`);
    const tokenResult = await request("post", "/mweb/v1/get_upload_token", refreshToken, {
      data: {
        scene: 2
        // AIGC 图片上传场景
      }
    });
    const { access_key_id, secret_access_key, session_token } = tokenResult;
    const service_id = regionInfo.isInternational ? tokenResult.space_name : tokenResult.service_id;
    if (!access_key_id || !secret_access_key || !session_token) {
      throw new Error("\u83B7\u53D6\u4E0A\u4F20\u4EE4\u724C\u5931\u8D25");
    }
    const actualServiceId = RegionUtils.getServiceId(regionInfo, service_id);
    logger_default.info(`\u83B7\u53D6\u4E0A\u4F20\u4EE4\u724C\u6210\u529F: service_id=${actualServiceId}`);
    const fileSize = imageBuffer.byteLength;
    const crc32 = util_default.calculateCRC32(imageBuffer);
    logger_default.info(`\u56FE\u7247Buffer: \u5927\u5C0F=${fileSize}\u5B57\u8282, CRC32=${crc32}`);
    const now = /* @__PURE__ */ new Date();
    const timestamp = now.toISOString().replace(/[:\-]/g, "").replace(/\.\d{3}Z$/, "Z");
    const randomStr = Math.random().toString(36).substring(2, 12);
    const applyUrlHost = RegionUtils.getImageXUrl(regionInfo);
    const applyUrl = `${applyUrlHost}/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}&FileSize=${fileSize}&s=${randomStr}${regionInfo.isInternational ? "&device_platform=web" : ""}`;
    const awsRegion = RegionUtils.getAWSRegion(regionInfo);
    const origin = RegionUtils.getOrigin(regionInfo);
    const requestHeaders = {
      "x-amz-date": timestamp,
      "x-amz-security-token": session_token
    };
    const authorization = createSignature("GET", applyUrl, requestHeaders, access_key_id, secret_access_key, session_token, "", awsRegion);
    logger_default.info(`\u7533\u8BF7\u4E0A\u4F20\u6743\u9650: ${applyUrl}`);
    let applyResponse;
    try {
      applyResponse = await (0, import_axios3.default)({
        method: "GET",
        url: applyUrl,
        headers: {
          "accept": "*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          "authorization": authorization,
          "origin": origin,
          "referer": `${origin}/ai-tool/generate`,
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "x-amz-date": timestamp,
          "x-amz-security-token": session_token
        },
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`Fetch\u8BF7\u6C42\u5931\u8D25\uFF0C\u76EE\u6807URL: ${applyUrl}`);
      logger_default.error(`\u9519\u8BEF\u8BE6\u60C5: ${fetchError.message}`);
      throw new Error(`\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${applyUrlHost}): ${fetchError.message}. \u8BF7\u68C0\u67E5: 1) \u7F51\u7EDC\u8FDE\u63A5\u662F\u5426\u6B63\u5E38 2) \u662F\u5426\u9700\u8981\u914D\u7F6E\u4EE3\u7406 3) DNS\u662F\u5426\u80FD\u89E3\u6790\u8BE5\u57DF\u540D`);
    }
    if (applyResponse.status < 200 || applyResponse.status >= 300) {
      const errorText = typeof applyResponse.data === "string" ? applyResponse.data : JSON.stringify(applyResponse.data);
      throw new Error(`\u7533\u8BF7\u4E0A\u4F20\u6743\u9650\u5931\u8D25: ${applyResponse.status} - ${errorText}`);
    }
    const applyResult = applyResponse.data;
    if ((_a2 = applyResult == null ? void 0 : applyResult.ResponseMetadata) == null ? void 0 : _a2.Error) {
      throw new Error(`\u7533\u8BF7\u4E0A\u4F20\u6743\u9650\u5931\u8D25: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
    }
    logger_default.info(`\u7533\u8BF7\u4E0A\u4F20\u6743\u9650\u6210\u529F`);
    const uploadAddress = (_b2 = applyResult == null ? void 0 : applyResult.Result) == null ? void 0 : _b2.UploadAddress;
    if (!uploadAddress || !uploadAddress.StoreInfos || !uploadAddress.UploadHosts) {
      throw new Error(`\u83B7\u53D6\u4E0A\u4F20\u5730\u5740\u5931\u8D25: ${JSON.stringify(applyResult)}`);
    }
    const storeInfo = uploadAddress.StoreInfos[0];
    const uploadHost = uploadAddress.UploadHosts[0];
    const auth = storeInfo.Auth;
    const uploadUrl = `https://${uploadHost}/upload/v1/${storeInfo.StoreUri}`;
    logger_default.info(`\u51C6\u5907\u4E0A\u4F20\u56FE\u7247: uploadUrl=${uploadUrl}`);
    let uploadResponse;
    try {
      uploadResponse = await (0, import_axios3.default)({
        method: "POST",
        url: uploadUrl,
        headers: {
          "Accept": "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Authorization": auth,
          "Connection": "keep-alive",
          "Content-CRC32": crc32,
          "Content-Disposition": 'attachment; filename="undefined"',
          "Content-Type": "application/octet-stream",
          "Origin": origin,
          "Referer": RegionUtils.getRefererPath(regionInfo),
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "cross-site",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
        },
        data: imageBuffer,
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`\u56FE\u7247\u6587\u4EF6\u4E0A\u4F20fetch\u8BF7\u6C42\u5931\u8D25\uFF0C\u76EE\u6807URL: ${uploadUrl}`);
      logger_default.error(`\u9519\u8BEF\u8BE6\u60C5: ${fetchError.message}`);
      throw new Error(`\u56FE\u7247\u4E0A\u4F20\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${uploadHost}): ${fetchError.message}. \u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5`);
    }
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      const errorText = typeof uploadResponse.data === "string" ? uploadResponse.data : JSON.stringify(uploadResponse.data);
      throw new Error(`\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ${uploadResponse.status} - ${errorText}`);
    }
    logger_default.info(`\u56FE\u7247\u6587\u4EF6\u4E0A\u4F20\u6210\u529F`);
    const commitUrl = `${applyUrlHost}/?Action=CommitImageUpload&Version=2018-08-01&ServiceId=${actualServiceId}`;
    const commitTimestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:\-]/g, "").replace(/\.\d{3}Z$/, "Z");
    const commitPayload = JSON.stringify({
      SessionKey: uploadAddress.SessionKey
    });
    const payloadHash = import_crypto3.default.createHash("sha256").update(commitPayload, "utf8").digest("hex");
    const commitRequestHeaders = {
      "x-amz-date": commitTimestamp,
      "x-amz-security-token": session_token,
      "x-amz-content-sha256": payloadHash
    };
    const commitAuthorization = createSignature("POST", commitUrl, commitRequestHeaders, access_key_id, secret_access_key, session_token, commitPayload, awsRegion);
    let commitResponse;
    try {
      commitResponse = await (0, import_axios3.default)({
        method: "POST",
        url: commitUrl,
        headers: {
          "accept": "*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          "authorization": commitAuthorization,
          "content-type": "application/json",
          "origin": origin,
          "referer": RegionUtils.getRefererPath(regionInfo),
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "x-amz-date": commitTimestamp,
          "x-amz-security-token": session_token,
          "x-amz-content-sha256": payloadHash
        },
        data: commitPayload,
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`\u63D0\u4EA4\u4E0A\u4F20fetch\u8BF7\u6C42\u5931\u8D25\uFF0C\u76EE\u6807URL: ${commitUrl}`);
      logger_default.error(`\u9519\u8BEF\u8BE6\u60C5: ${fetchError.message}`);
      throw new Error(`\u63D0\u4EA4\u4E0A\u4F20\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${applyUrlHost}): ${fetchError.message}. \u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5`);
    }
    if (commitResponse.status < 200 || commitResponse.status >= 300) {
      const errorText = typeof commitResponse.data === "string" ? commitResponse.data : JSON.stringify(commitResponse.data);
      throw new Error(`\u63D0\u4EA4\u4E0A\u4F20\u5931\u8D25: ${commitResponse.status} - ${errorText}`);
    }
    const commitResult = commitResponse.data;
    if ((_c = commitResult == null ? void 0 : commitResult.ResponseMetadata) == null ? void 0 : _c.Error) {
      throw new Error(`\u63D0\u4EA4\u4E0A\u4F20\u5931\u8D25: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
    }
    if (!((_d = commitResult == null ? void 0 : commitResult.Result) == null ? void 0 : _d.Results) || commitResult.Result.Results.length === 0) {
      throw new Error(`\u63D0\u4EA4\u4E0A\u4F20\u54CD\u5E94\u7F3A\u5C11\u7ED3\u679C: ${JSON.stringify(commitResult)}`);
    }
    const uploadResult = commitResult.Result.Results[0];
    if (uploadResult.UriStatus !== 2e3) {
      throw new Error(`\u56FE\u7247\u4E0A\u4F20\u72B6\u6001\u5F02\u5E38: UriStatus=${uploadResult.UriStatus}`);
    }
    const fullImageUri = uploadResult.Uri;
    const pluginResult = (_f = (_e = commitResult.Result) == null ? void 0 : _e.PluginResult) == null ? void 0 : _f[0];
    const width = (pluginResult == null ? void 0 : pluginResult.ImageWidth) || 0;
    const height = (pluginResult == null ? void 0 : pluginResult.ImageHeight) || 0;
    const format = (pluginResult == null ? void 0 : pluginResult.ImageFormat) || "";
    logger_default.info(`\u56FE\u7247\u4E0A\u4F20\u5B8C\u6210: ${fullImageUri} (${width}x${height}, ${format})`);
    return { uri: fullImageUri, width, height, format };
  } catch (error) {
    logger_default.error(`\u56FE\u7247Buffer\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
    throw error;
  }
}

// src/lib/video-uploader.ts
var import_crypto4 = __toESM(require("crypto"), 1);
var import_axios4 = __toESM(require("axios"), 1);
async function uploadVideoBuffer(videoBuffer, refreshToken, regionInfo) {
  var _a2, _b2, _c, _d, _e, _f, _g;
  try {
    const fileSize = videoBuffer.byteLength;
    logger_default.info(`\u5F00\u59CB\u4E0A\u4F20\u89C6\u9891Buffer... (size=${fileSize}, isInternational=${regionInfo.isInternational})`);
    const tokenResult = await request("post", "/mweb/v1/get_upload_token", refreshToken, {
      data: {
        scene: 1
        // VOD 视频上传场景
      }
    });
    const { access_key_id, secret_access_key, session_token, space_name } = tokenResult;
    if (!access_key_id || !secret_access_key || !session_token) {
      throw new Error("\u83B7\u53D6\u89C6\u9891\u4E0A\u4F20\u4EE4\u724C\u5931\u8D25");
    }
    const spaceName = space_name || "dreamina";
    logger_default.info(`\u83B7\u53D6\u89C6\u9891\u4E0A\u4F20\u4EE4\u724C\u6210\u529F: spaceName=${spaceName}`);
    const now = /* @__PURE__ */ new Date();
    const timestamp = now.toISOString().replace(/[:\-]/g, "").replace(/\.\d{3}Z$/, "Z");
    const randomStr = Math.random().toString(36).substring(2, 12);
    const vodHost = RegionUtils.getVodHost(regionInfo);
    logger_default.info(`\u89C6\u9891\u4E0A\u4F20 VOD \u57DF\u540D: ${vodHost} (region=${regionKey(regionInfo)})`);
    const applyUrl = `${vodHost}/?Action=ApplyUploadInner&Version=2020-11-19&SpaceName=${spaceName}&FileType=video&IsInner=1&FileSize=${fileSize}&s=${randomStr}`;
    const awsRegion = RegionUtils.getAWSRegion(regionInfo);
    const origin = RegionUtils.getOrigin(regionInfo);
    const requestHeaders = {
      "x-amz-date": timestamp,
      "x-amz-security-token": session_token
    };
    const authorization = createSignature(
      "GET",
      applyUrl,
      requestHeaders,
      access_key_id,
      secret_access_key,
      session_token,
      "",
      awsRegion,
      "vod"
    );
    logger_default.info(`\u7533\u8BF7\u89C6\u9891\u4E0A\u4F20\u6743\u9650: ${applyUrl}`);
    let applyResponse;
    try {
      applyResponse = await (0, import_axios4.default)({
        method: "GET",
        url: applyUrl,
        headers: {
          "accept": "*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          "authorization": authorization,
          "origin": origin,
          "referer": RegionUtils.getRefererPath(regionInfo),
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "x-amz-date": timestamp,
          "x-amz-security-token": session_token
        },
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`ApplyUploadInner\u8BF7\u6C42\u5931\u8D25: ${fetchError.message}`);
      throw new Error(`\u89C6\u9891\u4E0A\u4F20\u7533\u8BF7\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${vodHost}): ${fetchError.message}`);
    }
    if (applyResponse.status < 200 || applyResponse.status >= 300) {
      const errorText = typeof applyResponse.data === "string" ? applyResponse.data : JSON.stringify(applyResponse.data);
      throw new Error(`\u7533\u8BF7\u89C6\u9891\u4E0A\u4F20\u6743\u9650\u5931\u8D25: ${applyResponse.status} - ${errorText}`);
    }
    const applyResult = applyResponse.data;
    if ((_a2 = applyResult == null ? void 0 : applyResult.ResponseMetadata) == null ? void 0 : _a2.Error) {
      throw new Error(`\u7533\u8BF7\u89C6\u9891\u4E0A\u4F20\u6743\u9650\u5931\u8D25: ${JSON.stringify(applyResult.ResponseMetadata.Error)}`);
    }
    const uploadNodes = (_c = (_b2 = applyResult == null ? void 0 : applyResult.Result) == null ? void 0 : _b2.InnerUploadAddress) == null ? void 0 : _c.UploadNodes;
    if (!uploadNodes || uploadNodes.length === 0) {
      throw new Error(`\u83B7\u53D6\u89C6\u9891\u4E0A\u4F20\u8282\u70B9\u5931\u8D25: ${JSON.stringify(applyResult)}`);
    }
    const uploadNode = uploadNodes[0];
    const storeInfo = (_d = uploadNode.StoreInfos) == null ? void 0 : _d[0];
    if (!storeInfo) {
      throw new Error(`\u83B7\u53D6\u89C6\u9891\u4E0A\u4F20\u5B58\u50A8\u4FE1\u606F\u5931\u8D25: ${JSON.stringify(uploadNode)}`);
    }
    const uploadHost = uploadNode.UploadHost;
    const storeUri = storeInfo.StoreUri;
    const auth = storeInfo.Auth;
    const sessionKey = uploadNode.SessionKey;
    const vid = uploadNode.Vid;
    logger_default.info(`\u83B7\u53D6\u89C6\u9891\u4E0A\u4F20\u8282\u70B9\u6210\u529F: host=${uploadHost}, vid=${vid}, type=${uploadNode.Type}`);
    const uploadUrl = `https://${uploadHost}/upload/v1/${storeUri}`;
    const crc32 = util_default.calculateCRC32(videoBuffer);
    logger_default.info(`\u5F00\u59CB\u4E0A\u4F20\u89C6\u9891\u6587\u4EF6: ${uploadUrl}, CRC32=${crc32}`);
    let uploadResponse;
    try {
      uploadResponse = await (0, import_axios4.default)({
        method: "POST",
        url: uploadUrl,
        headers: {
          "Accept": "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Authorization": auth,
          "Connection": "keep-alive",
          "Content-CRC32": crc32,
          "Content-Type": "application/octet-stream",
          "Origin": origin,
          "Referer": RegionUtils.getRefererPath(regionInfo),
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "cross-site",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
        },
        data: videoBuffer,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`\u89C6\u9891\u6587\u4EF6\u4E0A\u4F20\u8BF7\u6C42\u5931\u8D25: ${fetchError.message}`);
      throw new Error(`\u89C6\u9891\u6587\u4EF6\u4E0A\u4F20\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${uploadHost}): ${fetchError.message}`);
    }
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      const errorText = typeof uploadResponse.data === "string" ? uploadResponse.data : JSON.stringify(uploadResponse.data);
      throw new Error(`\u89C6\u9891\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25: ${uploadResponse.status} - ${errorText}`);
    }
    const uploadData = uploadResponse.data;
    if ((uploadData == null ? void 0 : uploadData.code) !== 2e3) {
      throw new Error(`\u89C6\u9891\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25: code=${uploadData == null ? void 0 : uploadData.code}, message=${uploadData == null ? void 0 : uploadData.message}`);
    }
    logger_default.info(`\u89C6\u9891\u6587\u4EF6\u4E0A\u4F20\u6210\u529F: crc32=${(_e = uploadData.data) == null ? void 0 : _e.crc32}`);
    const commitUrl = `${vodHost}/?Action=CommitUploadInner&Version=2020-11-19&SpaceName=${spaceName}`;
    const commitTimestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:\-]/g, "").replace(/\.\d{3}Z$/, "Z");
    const commitPayload = JSON.stringify({
      SessionKey: sessionKey,
      Functions: []
    });
    const payloadHash = import_crypto4.default.createHash("sha256").update(commitPayload, "utf8").digest("hex");
    const commitRequestHeaders = {
      "x-amz-date": commitTimestamp,
      "x-amz-security-token": session_token,
      "x-amz-content-sha256": payloadHash
    };
    const commitAuthorization = createSignature(
      "POST",
      commitUrl,
      commitRequestHeaders,
      access_key_id,
      secret_access_key,
      session_token,
      commitPayload,
      awsRegion,
      "vod"
    );
    logger_default.info(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u786E\u8BA4: ${commitUrl}`);
    let commitResponse;
    try {
      commitResponse = await (0, import_axios4.default)({
        method: "POST",
        url: commitUrl,
        headers: {
          "accept": "*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          "authorization": commitAuthorization,
          "content-type": "application/json",
          "origin": origin,
          "referer": RegionUtils.getRefererPath(regionInfo),
          "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "x-amz-date": commitTimestamp,
          "x-amz-security-token": session_token,
          "x-amz-content-sha256": payloadHash
        },
        data: commitPayload,
        validateStatus: () => true
      });
    } catch (fetchError) {
      logger_default.error(`CommitUploadInner\u8BF7\u6C42\u5931\u8D25: ${fetchError.message}`);
      throw new Error(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25 (${vodHost}): ${fetchError.message}`);
    }
    if (commitResponse.status < 200 || commitResponse.status >= 300) {
      const errorText = typeof commitResponse.data === "string" ? commitResponse.data : JSON.stringify(commitResponse.data);
      throw new Error(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u5931\u8D25: ${commitResponse.status} - ${errorText}`);
    }
    const commitResult = commitResponse.data;
    if ((_f = commitResult == null ? void 0 : commitResult.ResponseMetadata) == null ? void 0 : _f.Error) {
      throw new Error(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u5931\u8D25: ${JSON.stringify(commitResult.ResponseMetadata.Error)}`);
    }
    if (!((_g = commitResult == null ? void 0 : commitResult.Result) == null ? void 0 : _g.Results) || commitResult.Result.Results.length === 0) {
      throw new Error(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u54CD\u5E94\u7F3A\u5C11\u7ED3\u679C: ${JSON.stringify(commitResult)}`);
    }
    const result = commitResult.Result.Results[0];
    const videoMeta = result.VideoMeta;
    if (!result.Vid) {
      throw new Error(`\u63D0\u4EA4\u89C6\u9891\u4E0A\u4F20\u54CD\u5E94\u7F3A\u5C11 Vid: ${JSON.stringify(result)}`);
    }
    const MAX_VIDEO_DURATION = 15;
    if ((videoMeta == null ? void 0 : videoMeta.Duration) && videoMeta.Duration > MAX_VIDEO_DURATION) {
      throw new Error(`\u89C6\u9891\u65F6\u957F ${videoMeta.Duration.toFixed(2)}s \u8D85\u8FC7\u9650\u5236 (\u6700\u5927 ${MAX_VIDEO_DURATION}s)`);
    }
    logger_default.info(`\u89C6\u9891\u4E0A\u4F20\u5B8C\u6210: vid=${result.Vid}, ${videoMeta == null ? void 0 : videoMeta.Width}x${videoMeta == null ? void 0 : videoMeta.Height}, ${videoMeta == null ? void 0 : videoMeta.Duration}s, ${videoMeta == null ? void 0 : videoMeta.Format}/${videoMeta == null ? void 0 : videoMeta.Codec}`);
    return {
      vid: result.Vid,
      uri: (videoMeta == null ? void 0 : videoMeta.Uri) || "",
      videoMeta: {
        width: (videoMeta == null ? void 0 : videoMeta.Width) || 0,
        height: (videoMeta == null ? void 0 : videoMeta.Height) || 0,
        duration: (videoMeta == null ? void 0 : videoMeta.Duration) || 0,
        bitrate: (videoMeta == null ? void 0 : videoMeta.Bitrate) || 0,
        format: (videoMeta == null ? void 0 : videoMeta.Format) || "",
        codec: (videoMeta == null ? void 0 : videoMeta.Codec) || "",
        size: (videoMeta == null ? void 0 : videoMeta.Size) || 0,
        md5: (videoMeta == null ? void 0 : videoMeta.Md5) || ""
      }
    };
  } catch (error) {
    logger_default.error(`\u89C6\u9891Buffer\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
    throw error;
  }
}
async function uploadVideoFromUrl(videoUrl, refreshToken, regionInfo) {
  try {
    logger_default.info(`\u5F00\u59CB\u4ECEURL\u4E0B\u8F7D\u5E76\u4E0A\u4F20\u89C6\u9891: ${videoUrl}`);
    const videoResponse = await import_axios4.default.get(videoUrl, {
      responseType: "arraybuffer",
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    if (videoResponse.status < 200 || videoResponse.status >= 300) {
      throw new Error(`\u4E0B\u8F7D\u89C6\u9891\u5931\u8D25: ${videoResponse.status}`);
    }
    const videoBuffer = videoResponse.data;
    logger_default.info(`\u89C6\u9891\u4E0B\u8F7D\u5B8C\u6210: ${videoBuffer.byteLength} \u5B57\u8282`);
    return await uploadVideoBuffer(videoBuffer, refreshToken, regionInfo);
  } catch (error) {
    logger_default.error(`\u4ECEURL\u4E0A\u4F20\u89C6\u9891\u5931\u8D25: ${error.message}`);
    throw error;
  }
}

// src/lib/image-utils.ts
function extractVideoUrl(item) {
  var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
  if ((_c = (_b2 = (_a2 = item == null ? void 0 : item.common_attr) == null ? void 0 : _a2.transcoded_video) == null ? void 0 : _b2.origin) == null ? void 0 : _c.video_url) {
    return item.common_attr.transcoded_video.origin.video_url;
  }
  if ((_f = (_e = (_d = item == null ? void 0 : item.video) == null ? void 0 : _d.transcoded_video) == null ? void 0 : _e.origin) == null ? void 0 : _f.video_url) {
    return item.video.transcoded_video.origin.video_url;
  }
  if ((_g = item == null ? void 0 : item.video) == null ? void 0 : _g.play_url) {
    return item.video.play_url;
  }
  if ((_h = item == null ? void 0 : item.video) == null ? void 0 : _h.download_url) {
    return item.video.download_url;
  }
  if ((_i = item == null ? void 0 : item.video) == null ? void 0 : _i.url) {
    return item.video.url;
  }
  return null;
}
async function fetchHighQualityVideoUrl(itemId, refreshToken) {
  var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  try {
    logger_default.info(`\u5C1D\u8BD5\u83B7\u53D6\u9AD8\u8D28\u91CF\u89C6\u9891\u4E0B\u8F7DURL\uFF0Citem_id: ${itemId}`);
    const result = await request("post", "/mweb/v1/get_local_item_list", refreshToken, {
      data: {
        item_id_list: [itemId],
        pack_item_opt: {
          scene: 1,
          need_data_integrity: true
        },
        is_for_video_download: true
      }
    });
    const responseStr = JSON.stringify(result);
    logger_default.info(`get_local_item_list \u54CD\u5E94\u5927\u5C0F: ${responseStr.length} \u5B57\u7B26`);
    const itemList = result.item_list || result.local_item_list || [];
    if (itemList.length > 0) {
      const item = itemList[0];
      const videoModelStr = (_a2 = item == null ? void 0 : item.video) == null ? void 0 : _a2.video_model;
      if (videoModelStr && typeof videoModelStr === "string") {
        try {
          const videoModel = JSON.parse(videoModelStr);
          const videoList = videoModel == null ? void 0 : videoModel.video_list;
          if (videoList && typeof videoList === "object") {
            const priorityKeys = ["video_4", "video_3", "video_2", "video_1"];
            for (const key of priorityKeys) {
              const mainUrlB64 = (_b2 = videoList[key]) == null ? void 0 : _b2.main_url;
              if (mainUrlB64 && typeof mainUrlB64 === "string") {
                const decodedUrl = atob(mainUrlB64);
                if (decodedUrl.startsWith("http")) {
                  const definition = ((_c = videoList[key]) == null ? void 0 : _c.definition) || key;
                  logger_default.info(`\u4ECEvideo_model\u63D0\u53D6\u5230\u65E0\u6C34\u5370\u89C6\u9891URL (${definition}): ${decodedUrl}`);
                  return decodedUrl;
                }
              }
            }
          }
        } catch (e) {
          logger_default.warn(`\u89E3\u6790video_model JSON\u5931\u8D25: ${e.message}`);
        }
      }
    }
    if (itemList.length > 0) {
      const item = itemList[0];
      const videoUrl = ((_f = (_e = (_d = item == null ? void 0 : item.common_attr) == null ? void 0 : _d.transcoded_video) == null ? void 0 : _e.origin) == null ? void 0 : _f.video_url) || ((_i = (_h = (_g = item == null ? void 0 : item.video) == null ? void 0 : _g.transcoded_video) == null ? void 0 : _h.origin) == null ? void 0 : _i.video_url) || ((_j = item == null ? void 0 : item.video) == null ? void 0 : _j.download_url) || ((_k = item == null ? void 0 : item.video) == null ? void 0 : _k.play_url) || ((_l = item == null ? void 0 : item.video) == null ? void 0 : _l.url);
      if (videoUrl) {
        logger_default.info(`\u4ECEget_local_item_list\u7ED3\u6784\u5316\u5B57\u6BB5\u83B7\u53D6\u5230\u9AD8\u6E05\u89C6\u9891URL(\u53EF\u80FD\u542B\u6C34\u5370): ${videoUrl}`);
        return videoUrl;
      }
    }
    const hqUrlMatch = responseStr.match(/https:\/\/v[0-9]+-dreamnia\.jimeng\.com\/[^"\s\\]+/);
    if (hqUrlMatch && hqUrlMatch[0]) {
      logger_default.info(`\u6B63\u5219\u63D0\u53D6\u5230\u9AD8\u8D28\u91CF\u89C6\u9891URL (dreamnia): ${hqUrlMatch[0]}`);
      return hqUrlMatch[0];
    }
    const jimengUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.jimeng\.com\/[^"\s\\]+/);
    if (jimengUrlMatch && jimengUrlMatch[0]) {
      logger_default.info(`\u6B63\u5219\u63D0\u53D6\u5230jimeng\u89C6\u9891URL: ${jimengUrlMatch[0]}`);
      return jimengUrlMatch[0];
    }
    const anyVideoUrlMatch = responseStr.match(/https:\/\/v[0-9]+-[^"\\]*\.(vlabvod|jimeng)\.com\/[^"\s\\]+/);
    if (anyVideoUrlMatch && anyVideoUrlMatch[0]) {
      logger_default.info(`\u4ECEget_local_item_list\u63D0\u53D6\u5230\u89C6\u9891URL: ${anyVideoUrlMatch[0]}`);
      return anyVideoUrlMatch[0];
    }
    logger_default.warn(`\u672A\u80FD\u4ECEget_local_item_list\u54CD\u5E94\u4E2D\u63D0\u53D6\u5230\u89C6\u9891URL`);
    return null;
  } catch (error) {
    logger_default.warn(`\u83B7\u53D6\u9AD8\u8D28\u91CF\u89C6\u9891\u4E0B\u8F7DURL\u5931\u8D25: ${error.message}`);
    return null;
  }
}

// src/api/controllers/videos.ts
var DEFAULT_MODEL = DEFAULT_VIDEO_MODEL;
function getVideoModelMap(regionInfo) {
  let base;
  if (regionInfo.isUS) {
    base = VIDEO_MODEL_MAP_US;
  } else if (regionInfo.isHK || regionInfo.isJP || regionInfo.isSG) {
    base = VIDEO_MODEL_MAP_ASIA;
  } else {
    base = VIDEO_MODEL_MAP;
  }
  const map = { ...base, ...getModelOverrides(regionInfo) };
  if (!isSeedance2EnabledFor(regionInfo)) {
    delete map["jimeng-video-seedance-2.0"];
    delete map["jimeng-video-seedance-2.0-fast"];
  }
  return map;
}
function getModel(model, regionInfo) {
  const modelMap = getVideoModelMap(regionInfo);
  const name = model || DEFAULT_MODEL;
  const key = modelMap[name];
  if (!key) {
    throw new APIException(
      exceptions_default.API_REQUEST_FAILED,
      `\u89C6\u9891\u6A21\u578B ${name} \u5728\u5F53\u524D\u533A\u57DF (${regionKey(regionInfo)}) \u4E0D\u53D7\u652F\u6301\u3002\u53EF\u7528\u6A21\u578B: ${Object.keys(modelMap).join(", ")}`
    );
  }
  return key;
}
var BASE_PROFILE = {
  benefitSeedance20Pro: "dreamina_video_seedance_20_pro",
  benefitSeedance20Fast: "dreamina_seedance_20_fast",
  omniBenefitPro: OMNI_BENEFIT_TYPE,
  omniBenefitFast: OMNI_BENEFIT_TYPE_FAST,
  draftVersion: DRAFT_VERSION,
  draftVersionOmni: DRAFT_VERSION_OMNI,
  webVersion: "7.5.0"
};
function getRegionVideoProfile(regionInfo) {
  return getVideoProfile(regionInfo, BASE_PROFILE);
}
function getVideoBenefitType(model, profile = getVideoProfile({ isCN: true }, BASE_PROFILE)) {
  if (model.includes("veo3.1")) {
    return "generate_video_veo3.1";
  }
  if (model.includes("veo3")) {
    return "generate_video_veo3";
  }
  if (model.includes("sora2")) {
    return "generate_video_sora2";
  }
  if (model.includes("40_pro")) {
    return profile.benefitSeedance20Pro;
  }
  if (model.includes("40")) {
    return profile.benefitSeedance20Fast;
  }
  if (model.includes("3.5_pro")) {
    return "dreamina_video_seedance_15_pro";
  }
  if (model.includes("3.5")) {
    return "dreamina_video_seedance_15";
  }
  return "basic_video_operation_vgfm_v_three";
}
async function uploadImageFromFile(file, refreshToken, regionInfo) {
  try {
    logger_default.info(`\u5F00\u59CB\u4ECE\u672C\u5730\u6587\u4EF6\u4E0A\u4F20\u89C6\u9891\u56FE\u7247: ${file.originalFilename} (\u8DEF\u5F84: ${file.filepath})`);
    const imageBuffer = await import_fs_extra6.default.readFile(file.filepath);
    return await uploadImageBuffer(imageBuffer, refreshToken, regionInfo);
  } catch (error) {
    logger_default.error(`\u4ECE\u672C\u5730\u6587\u4EF6\u4E0A\u4F20\u89C6\u9891\u56FE\u7247\u5931\u8D25: ${error.message}`);
    throw error;
  }
}
async function uploadImageFromUrl(imageUrl, refreshToken, regionInfo) {
  try {
    logger_default.info(`\u5F00\u59CB\u4ECEURL\u4E0B\u8F7D\u5E76\u4E0A\u4F20\u89C6\u9891\u56FE\u7247: ${imageUrl}`);
    const imageResponse = await import_axios5.default.get(imageUrl, {
      responseType: "arraybuffer",
      proxy: false
    });
    if (imageResponse.status < 200 || imageResponse.status >= 300) {
      throw new Error(`\u4E0B\u8F7D\u56FE\u7247\u5931\u8D25: ${imageResponse.status}`);
    }
    const imageBuffer = imageResponse.data;
    return await uploadImageBuffer(imageBuffer, refreshToken, regionInfo);
  } catch (error) {
    logger_default.error(`\u4ECEURL\u4E0A\u4F20\u89C6\u9891\u56FE\u7247\u5931\u8D25: ${error.message}`);
    throw error;
  }
}
function parseOmniPrompt(prompt, materialRegistry) {
  const refNames = [...materialRegistry.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (refNames.length === 0) {
    return [{ meta_type: "text", text: prompt }];
  }
  const pattern = new RegExp(`@(${refNames.join("|")})`, "g");
  const meta_list = [];
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(prompt)) !== null) {
    if (match.index > lastIndex) {
      const textSegment = prompt.slice(lastIndex, match.index);
      if (textSegment) {
        meta_list.push({ meta_type: "text", text: textSegment });
      }
    }
    const refName = match[1];
    const entry = materialRegistry.get(refName);
    if (entry) {
      meta_list.push({
        meta_type: entry.type,
        text: "",
        material_ref: { material_idx: entry.idx }
      });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < prompt.length) {
    meta_list.push({ meta_type: "text", text: prompt.slice(lastIndex) });
  }
  if (meta_list.length === 0) {
    meta_list.push({ meta_type: "text", text: prompt });
  }
  return meta_list;
}
async function generateVideo(_model, prompt, {
  ratio = "1:1",
  resolution = "720p",
  duration = 5,
  filePaths = [],
  files = {},
  httpRequest,
  functionMode = "first_last_frames",
  submitOnly = false,
  clientSubmitId = util_default.uuid()
}, refreshToken) {
  var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
  const regionInfo = parseRegionFromToken(refreshToken);
  const { isInternational } = regionInfo;
  logger_default.info(`\u89C6\u9891\u751F\u6210\u533A\u57DF\u68C0\u6D4B: isInternational=${isInternational}`);
  const model = getModel(_model, regionInfo);
  const profile = getRegionVideoProfile(regionInfo);
  const isVeo3 = model.includes("veo3");
  const isSora2 = model.includes("sora2");
  const is35Pro = model.includes("3.5_pro");
  const is40Pro = model.includes("40_pro");
  const is40 = model.includes("40") && !model.includes("40_pro");
  const supportsResolution = (model.includes("vgfm_3.0") || model.includes("vgfm_3.0_fast")) && !model.includes("_pro");
  let durationMs;
  let actualDuration;
  if (isVeo3) {
    durationMs = 8e3;
    actualDuration = 8;
  } else if (isSora2) {
    if (duration === 12) {
      durationMs = 12e3;
      actualDuration = 12;
    } else if (duration === 8) {
      durationMs = 8e3;
      actualDuration = 8;
    } else {
      durationMs = 4e3;
      actualDuration = 4;
    }
  } else if (is40Pro || is40) {
    actualDuration = Math.max(4, Math.min(15, duration));
    durationMs = actualDuration * 1e3;
  } else if (is35Pro) {
    if (duration === 12) {
      durationMs = 12e3;
      actualDuration = 12;
    } else if (duration === 10) {
      durationMs = 1e4;
      actualDuration = 10;
    } else {
      durationMs = 5e3;
      actualDuration = 5;
    }
  } else {
    durationMs = duration === 10 ? 1e4 : 5e3;
    actualDuration = duration === 10 ? 10 : 5;
  }
  logger_default.info(`[video] region=${regionKey(regionInfo)} model=${_model} req_key=${model} benefit=${is40Pro || is40 ? functionMode === "omni_reference" ? is40 ? profile.omniBenefitFast : profile.omniBenefitPro : getVideoBenefitType(model, profile) : getVideoBenefitType(model, profile)} draft=${functionMode === "omni_reference" ? profile.draftVersionOmni : profile.draftVersion} referer=${profile.videoReferer} vod=${RegionUtils.getVodHost(regionInfo)} mode=${functionMode}`);
  logger_default.info(`\u4F7F\u7528\u6A21\u578B: ${_model} \u6620\u5C04\u6A21\u578B: ${model} \u6BD4\u4F8B: ${ratio} \u5206\u8FA8\u7387: ${supportsResolution ? resolution : "\u4E0D\u652F\u6301"} \u65F6\u957F: ${actualDuration}s`);
  const { totalCredit } = await getCredit(refreshToken);
  if (totalCredit <= 0) {
    logger_default.info("\u79EF\u5206\u4E3A 0\uFF0C\u5C1D\u8BD5\u6536\u53D6\u4ECA\u65E5\u79EF\u5206...");
    try {
      await receiveCredit(refreshToken);
    } catch (receiveError) {
      logger_default.warn(`\u6536\u53D6\u79EF\u5206\u5931\u8D25: ${receiveError.message}. \u8FD9\u53EF\u80FD\u662F\u56E0\u4E3A: 1) \u4ECA\u65E5\u5DF2\u6536\u53D6\u8FC7\u79EF\u5206, 2) \u8D26\u6237\u53D7\u5230\u98CE\u63A7\u9650\u5236, 3) \u9700\u8981\u5728\u5B98\u7F51\u624B\u52A8\u6536\u53D6\u9996\u6B21\u79EF\u5206`);
      throw new APIException(
        exceptions_default.API_VIDEO_GENERATION_FAILED,
        `\u79EF\u5206\u4E0D\u8DB3\u4E14\u65E0\u6CD5\u81EA\u52A8\u6536\u53D6\u3002\u8BF7\u8BBF\u95EE\u5373\u68A6\u5B98\u7F51\u624B\u52A8\u6536\u53D6\u9996\u6B21\u79EF\u5206\uFF0C\u6216\u68C0\u67E5\u8D26\u6237\u72B6\u6001\u3002`
      );
    }
  }
  const isOmniMode = functionMode === "omni_reference";
  if (isOmniMode && !is40Pro && !is40) {
    throw new APIException(
      exceptions_default.API_REQUEST_FAILED,
      `omni_reference \u6A21\u5F0F\u4EC5\u652F\u6301 jimeng-video-seedance-2.0 \u548C jimeng-video-seedance-2.0-fast \u6A21\u578B`
    );
  }
  let requestData;
  if (isOmniMode) {
    let registerAlias = function(filename, entry) {
      if (!canonicalKeys.has(filename) && !materialRegistry.has(filename)) {
        materialRegistry.set(filename, entry);
      }
    };
    logger_default.info(`\u8FDB\u5165 omni_reference \u5168\u80FD\u6A21\u5F0F`);
    const materialRegistry = /* @__PURE__ */ new Map();
    let materialIdx = 0;
    const canonicalKeys = /* @__PURE__ */ new Set();
    canonicalKeys.add("image_file");
    canonicalKeys.add("video_file");
    for (let i = 1; i <= 9; i++) canonicalKeys.add(`image_file_${i}`);
    for (let i = 1; i <= 3; i++) canonicalKeys.add(`video_file_${i}`);
    const imageFields = [];
    const videoFields = [];
    if (files) {
      for (const fieldName of Object.keys(files)) {
        if (fieldName === "image_file" || fieldName.startsWith("image_file_")) imageFields.push(fieldName);
        else if (fieldName === "video_file" || fieldName.startsWith("video_file_")) videoFields.push(fieldName);
      }
    }
    for (let i = 1; i <= 9; i++) {
      const fieldName = `image_file_${i}`;
      if (typeof ((_a2 = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _a2[fieldName]) === "string" && httpRequest.body[fieldName].startsWith("http")) {
        if (!imageFields.includes(fieldName)) imageFields.push(fieldName);
      }
    }
    for (let i = 1; i <= 3; i++) {
      const fieldName = `video_file_${i}`;
      if (typeof ((_b2 = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _b2[fieldName]) === "string" && httpRequest.body[fieldName].startsWith("http")) {
        if (!videoFields.includes(fieldName)) videoFields.push(fieldName);
      }
    }
    if (typeof ((_c = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _c.image_file) === "string" && httpRequest.body.image_file.startsWith("http")) {
      if (!imageFields.includes("image_file")) imageFields.push("image_file");
    }
    if (typeof ((_d = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _d.video_file) === "string" && httpRequest.body.video_file.startsWith("http")) {
      if (!videoFields.includes("video_file")) videoFields.push("video_file");
    }
    const hasFilePaths = filePaths && filePaths.length > 0;
    if (imageFields.length === 0 && videoFields.length === 0 && !hasFilePaths) {
      throw new APIException(
        exceptions_default.API_REQUEST_FAILED,
        `omni_reference \u6A21\u5F0F\u9700\u8981\u81F3\u5C11\u4E0A\u4F20\u4E00\u4E2A\u7D20\u6750\u6587\u4EF6 (image_file_*, video_file_*) \u6216\u63D0\u4F9B\u7D20\u6750URL`
      );
    }
    let totalVideoDuration = 0;
    for (const fieldName of imageFields) {
      const imageFile = files == null ? void 0 : files[fieldName];
      const imageUrlField = (_e = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _e[fieldName];
      try {
        logger_default.info(`[omni] \u4E0A\u4F20 ${fieldName}`);
        let imgResult;
        if (imageFile) {
          const buf = await import_fs_extra6.default.readFile(imageFile.filepath);
          imgResult = await uploadImageBuffer(buf, refreshToken, regionInfo);
          await checkImageContent(imgResult.uri, refreshToken, regionInfo);
          const entry = {
            idx: materialIdx++,
            type: "image",
            fieldName,
            originalFilename: imageFile.originalFilename,
            imageUri: imgResult.uri,
            imageWidth: imgResult.width,
            imageHeight: imgResult.height,
            imageFormat: imgResult.format
          };
          materialRegistry.set(fieldName, entry);
          registerAlias(imageFile.originalFilename, entry);
          logger_default.info(`[omni] ${fieldName} \u4E0A\u4F20\u6210\u529F: ${imgResult.uri} (${imgResult.width}x${imgResult.height})`);
        } else if (imageUrlField && typeof imageUrlField === "string" && imageUrlField.startsWith("http")) {
          imgResult = await uploadImageFromUrl(imageUrlField, refreshToken, regionInfo);
          await checkImageContent(imgResult.uri, refreshToken, regionInfo);
          const entry = {
            idx: materialIdx++,
            type: "image",
            fieldName,
            originalFilename: imageUrlField,
            imageUri: imgResult.uri,
            imageWidth: imgResult.width,
            imageHeight: imgResult.height,
            imageFormat: imgResult.format
          };
          materialRegistry.set(fieldName, entry);
          logger_default.info(`[omni] ${fieldName} URL\u4E0A\u4F20\u6210\u529F: ${imgResult.uri} (${imgResult.width}x${imgResult.height})`);
        }
      } catch (error) {
        throw new APIException(exceptions_default.API_REQUEST_FAILED, `${fieldName} \u5904\u7406\u5931\u8D25: ${error.message}`);
      }
    }
    if (filePaths && filePaths.length > 0) {
      let slotIndex = 1;
      for (const url of filePaths) {
        while (slotIndex <= 9 && materialRegistry.has(`image_file_${slotIndex}`)) {
          slotIndex++;
        }
        if (slotIndex > 9) break;
        const fieldName = `image_file_${slotIndex}`;
        try {
          logger_default.info(`[omni] \u4ECEURL\u4E0A\u4F20 ${fieldName}: ${url}`);
          const imgResult = await uploadImageFromUrl(url, refreshToken, regionInfo);
          await checkImageContent(imgResult.uri, refreshToken, regionInfo);
          const entry = {
            idx: materialIdx++,
            type: "image",
            fieldName,
            originalFilename: url,
            imageUri: imgResult.uri,
            imageWidth: imgResult.width,
            imageHeight: imgResult.height,
            imageFormat: imgResult.format
          };
          materialRegistry.set(fieldName, entry);
          logger_default.info(`[omni] ${fieldName} URL\u4E0A\u4F20\u6210\u529F: ${imgResult.uri} (${imgResult.width}x${imgResult.height})`);
        } catch (error) {
          throw new APIException(exceptions_default.API_REQUEST_FAILED, `${fieldName} URL\u56FE\u7247\u5904\u7406\u5931\u8D25: ${error.message}`);
        }
        slotIndex++;
      }
    }
    for (const fieldName of videoFields) {
      const videoFile = files == null ? void 0 : files[fieldName];
      const videoUrlField = (_f = httpRequest == null ? void 0 : httpRequest.body) == null ? void 0 : _f[fieldName];
      try {
        logger_default.info(`[omni] \u4E0A\u4F20 ${fieldName}`);
        let vResult;
        if (videoFile) {
          const buf = await import_fs_extra6.default.readFile(videoFile.filepath);
          vResult = await uploadVideoBuffer(buf, refreshToken, regionInfo);
          totalVideoDuration += vResult.videoMeta.duration;
          const entry = {
            idx: materialIdx++,
            type: "video",
            fieldName,
            originalFilename: videoFile.originalFilename,
            videoResult: vResult
          };
          materialRegistry.set(fieldName, entry);
          registerAlias(videoFile.originalFilename, entry);
          logger_default.info(`[omni] ${fieldName} \u4E0A\u4F20\u6210\u529F: vid=${vResult.vid}, ${vResult.videoMeta.width}x${vResult.videoMeta.height}, ${vResult.videoMeta.duration}s`);
        } else if (videoUrlField && typeof videoUrlField === "string" && videoUrlField.startsWith("http")) {
          vResult = await uploadVideoFromUrl(videoUrlField, refreshToken, regionInfo);
          totalVideoDuration += vResult.videoMeta.duration;
          const entry = {
            idx: materialIdx++,
            type: "video",
            fieldName,
            originalFilename: videoUrlField,
            videoResult: vResult
          };
          materialRegistry.set(fieldName, entry);
          logger_default.info(`[omni] ${fieldName} URL\u4E0A\u4F20\u6210\u529F: vid=${vResult.vid}, ${vResult.videoMeta.width}x${vResult.videoMeta.height}, ${vResult.videoMeta.duration}s`);
        }
      } catch (error) {
        throw new APIException(exceptions_default.API_REQUEST_FAILED, `${fieldName} \u5904\u7406\u5931\u8D25: ${error.message}`);
      }
    }
    const MAX_TOTAL_VIDEO_DURATION = 15;
    if (!Number.isFinite(totalVideoDuration)) {
      throw new APIException(
        exceptions_default.API_REQUEST_FAILED,
        `\u89C6\u9891\u65F6\u957F\u6570\u636E\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u89C6\u9891\u6587\u4EF6`
      );
    }
    if (totalVideoDuration > MAX_TOTAL_VIDEO_DURATION) {
      throw new APIException(
        exceptions_default.API_REQUEST_FAILED,
        `\u89C6\u9891\u603B\u65F6\u957F ${totalVideoDuration.toFixed(2)}s \u8D85\u8FC7\u9650\u5236 (\u6700\u5927 ${MAX_TOTAL_VIDEO_DURATION}s)`
      );
    }
    logger_default.info(`[omni] \u89C6\u9891\u603B\u65F6\u957F: ${totalVideoDuration.toFixed(2)}s`);
    const orderedEntries = [...new Map([...materialRegistry].filter(([k, v]) => k === v.fieldName)).values()].sort((a, b) => a.idx - b.idx);
    const material_list = [];
    const materialTypes = [];
    for (const entry of orderedEntries) {
      if (entry.type === "image") {
        material_list.push({
          type: "",
          id: util_default.uuid(),
          material_type: "image",
          image_info: {
            type: "image",
            id: util_default.uuid(),
            source_from: "upload",
            platform_type: 1,
            name: "",
            image_uri: entry.imageUri,
            width: entry.imageWidth || 0,
            height: entry.imageHeight || 0,
            format: entry.imageFormat || "",
            uri: entry.imageUri
          }
        });
        materialTypes.push(1);
      } else {
        const vm = entry.videoResult;
        material_list.push({
          type: "",
          id: util_default.uuid(),
          material_type: "video",
          video_info: {
            type: "video",
            id: util_default.uuid(),
            source_from: "upload",
            name: "",
            vid: vm.vid,
            fps: 0,
            width: vm.videoMeta.width,
            height: vm.videoMeta.height,
            duration: Math.round(vm.videoMeta.duration * 1e3)
          }
        });
        materialTypes.push(2);
      }
    }
    const meta_list = parseOmniPrompt(prompt, materialRegistry);
    logger_default.info(`[omni] material_list: ${material_list.length} \u9879, meta_list: ${meta_list.length} \u9879, materialTypes: [${materialTypes}]`);
    const componentId = util_default.uuid();
    const submitId = clientSubmitId;
    const sceneOption = {
      type: "video",
      scene: "BasicVideoGenerateButton",
      modelReqKey: model,
      videoDuration: actualDuration,
      materialTypes,
      reportParams: {
        enterSource: "generate",
        vipSource: "generate",
        extraVipFunctionKey: model,
        useVipFunctionDetailsReporterHoc: true
      }
    };
    const metricsExtra = JSON.stringify({
      position: "page_bottom_box",
      isDefaultSeed: 1,
      originSubmitId: submitId,
      isRegenerate: false,
      enterFrom: "click",
      functionMode: "omni_reference",
      sceneOptions: JSON.stringify([sceneOption])
    });
    const omniBenefitType = is40 ? profile.omniBenefitFast : profile.omniBenefitPro;
    requestData = {
      params: {
        aigc_features: "app_lip_sync",
        web_version: profile.webVersion,
        da_version: profile.draftVersionOmni
      },
      data: {
        extend: {
          root_model: model,
          m_video_commerce_info: {
            benefit_type: omniBenefitType,
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          },
          m_video_commerce_info_list: [{
            benefit_type: omniBenefitType,
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          }]
        },
        submit_id: submitId,
        metrics_extra: metricsExtra,
        draft_content: JSON.stringify({
          type: "draft",
          id: util_default.uuid(),
          min_version: profile.draftVersionOmni,
          min_features: ["AIGC_Video_UnifiedEdit"],
          is_from_tsn: true,
          version: profile.draftVersionOmni,
          main_component_id: componentId,
          component_list: [{
            type: "video_base_component",
            id: componentId,
            min_version: "1.0.0",
            aigc_mode: "workbench",
            metadata: {
              type: "",
              id: util_default.uuid(),
              created_platform: 3,
              created_platform_version: "",
              created_time_in_ms: Date.now().toString(),
              created_did: ""
            },
            generate_type: "gen_video",
            abilities: {
              type: "",
              id: util_default.uuid(),
              gen_video: {
                id: util_default.uuid(),
                type: "",
                text_to_video_params: {
                  type: "",
                  id: util_default.uuid(),
                  video_gen_inputs: [{
                    type: "",
                    id: util_default.uuid(),
                    min_version: profile.draftVersionOmni,
                    prompt: "",
                    video_mode: 2,
                    fps: 24,
                    duration_ms: durationMs,
                    unified_edit_input: {
                      type: "",
                      id: util_default.uuid(),
                      material_list,
                      meta_list
                    },
                    idip_meta_list: []
                  }],
                  video_aspect_ratio: ratio,
                  seed: Math.floor(Math.random() * 4294967296),
                  model_req_key: model,
                  priority: 0
                },
                video_task_extra: metricsExtra
              }
            },
            process_type: 1
          }]
        }),
        http_common_info: {
          aid: getAssistantId(regionInfo)
        }
      }
    };
  } else {
    let first_frame_image = void 0;
    let end_frame_image = void 0;
    let uploadIDs = [];
    const uploadedFiles = import_lodash8.default.values(files);
    if (uploadedFiles && uploadedFiles.length > 0) {
      logger_default.info(`\u68C0\u6D4B\u5230 ${uploadedFiles.length} \u4E2A\u672C\u5730\u4E0A\u4F20\u6587\u4EF6\uFF0C\u4F18\u5148\u5904\u7406`);
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        if (!file) continue;
        try {
          logger_default.info(`\u5F00\u59CB\u4E0A\u4F20\u7B2C ${i + 1} \u5F20\u672C\u5730\u56FE\u7247: ${file.originalFilename}`);
          const imgResult = await uploadImageFromFile(file, refreshToken, regionInfo);
          if (imgResult) {
            await checkImageContent(imgResult.uri, refreshToken, regionInfo);
            uploadIDs.push(imgResult.uri);
            logger_default.info(`\u7B2C ${i + 1} \u5F20\u672C\u5730\u56FE\u7247\u4E0A\u4F20\u6210\u529F: ${imgResult.uri}`);
          } else {
            logger_default.error(`\u7B2C ${i + 1} \u5F20\u672C\u5730\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: \u672A\u83B7\u53D6\u5230 image_uri`);
          }
        } catch (error) {
          logger_default.error(`\u7B2C ${i + 1} \u5F20\u672C\u5730\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
          if (i === 0) {
            throw new APIException(exceptions_default.API_REQUEST_FAILED, `\u9996\u5E27\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
          }
        }
      }
    } else if (filePaths && filePaths.length > 0) {
      logger_default.info(`\u672A\u68C0\u6D4B\u5230\u672C\u5730\u4E0A\u4F20\u6587\u4EF6\uFF0C\u5904\u7406 ${filePaths.length} \u4E2A\u56FE\u7247URL`);
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        if (!filePath) {
          logger_default.warn(`\u7B2C ${i + 1} \u4E2A\u56FE\u7247URL\u4E3A\u7A7A\uFF0C\u8DF3\u8FC7`);
          continue;
        }
        try {
          logger_default.info(`\u5F00\u59CB\u4E0A\u4F20\u7B2C ${i + 1} \u4E2AURL\u56FE\u7247: ${filePath}`);
          const imgResult = await uploadImageFromUrl(filePath, refreshToken, regionInfo);
          if (imgResult) {
            await checkImageContent(imgResult.uri, refreshToken, regionInfo);
            uploadIDs.push(imgResult.uri);
            logger_default.info(`\u7B2C ${i + 1} \u4E2AURL\u56FE\u7247\u4E0A\u4F20\u6210\u529F: ${imgResult.uri}`);
          } else {
            logger_default.error(`\u7B2C ${i + 1} \u4E2AURL\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: \u672A\u83B7\u53D6\u5230 image_uri`);
          }
        } catch (error) {
          logger_default.error(`\u7B2C ${i + 1} \u4E2AURL\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
          if (i === 0) {
            throw new APIException(exceptions_default.API_REQUEST_FAILED, `\u9996\u5E27\u56FE\u7247\u4E0A\u4F20\u5931\u8D25: ${error.message}`);
          }
        }
      }
    } else {
      logger_default.info(`\u672A\u63D0\u4F9B\u56FE\u7247\u6587\u4EF6\u6216URL\uFF0C\u5C06\u8FDB\u884C\u7EAF\u6587\u672C\u89C6\u9891\u751F\u6210`);
    }
    if (uploadIDs.length > 0) {
      logger_default.info(`\u56FE\u7247\u4E0A\u4F20\u5B8C\u6210\uFF0C\u5171\u6210\u529F ${uploadIDs.length} \u5F20`);
      if (uploadIDs[0]) {
        first_frame_image = {
          format: "",
          height: 0,
          id: util_default.uuid(),
          image_uri: uploadIDs[0],
          name: "",
          platform_type: 1,
          source_from: "upload",
          type: "image",
          uri: uploadIDs[0],
          width: 0
        };
        logger_default.info(`\u8BBE\u7F6E\u9996\u5E27\u56FE\u7247: ${uploadIDs[0]}`);
      }
      if (uploadIDs[1]) {
        end_frame_image = {
          format: "",
          height: 0,
          id: util_default.uuid(),
          image_uri: uploadIDs[1],
          name: "",
          platform_type: 1,
          source_from: "upload",
          type: "image",
          uri: uploadIDs[1],
          width: 0
        };
        logger_default.info(`\u8BBE\u7F6E\u5C3E\u5E27\u56FE\u7247: ${uploadIDs[1]}`);
      }
    }
    const componentId = util_default.uuid();
    const originSubmitId = util_default.uuid();
    const flFunctionMode = "first_last_frames";
    const sceneOption = {
      type: "video",
      scene: "BasicVideoGenerateButton",
      ...supportsResolution ? { resolution } : {},
      modelReqKey: model,
      videoDuration: actualDuration,
      materialTypes: [],
      reportParams: {
        enterSource: "generate",
        vipSource: "generate",
        extraVipFunctionKey: supportsResolution ? `${model}-${resolution}` : model,
        useVipFunctionDetailsReporterHoc: true
      }
    };
    const metricsExtra = JSON.stringify({
      promptSource: "custom",
      isDefaultSeed: 1,
      originSubmitId,
      isRegenerate: false,
      enterFrom: "use_bgimage_prompt",
      position: "page_bottom_box",
      functionMode: flFunctionMode,
      sceneOptions: JSON.stringify([sceneOption])
    });
    const hasImageInput = uploadIDs.length > 0;
    if (hasImageInput && ratio !== "1:1") {
      logger_default.warn(`\u56FE\u751F\u89C6\u9891\u6A21\u5F0F\u4E0B\uFF0Cratio\u53C2\u6570\u5C06\u88AB\u5FFD\u7565\uFF08\u7531\u8F93\u5165\u56FE\u7247\u7684\u5B9E\u9645\u6BD4\u4F8B\u51B3\u5B9A\uFF09\uFF0C\u4F46resolution\u53C2\u6570\u4ECD\u7136\u6709\u6548`);
    }
    logger_default.info(`\u89C6\u9891\u751F\u6210\u6A21\u5F0F: ${uploadIDs.length}\u5F20\u56FE\u7247 (\u9996\u5E27: ${!!first_frame_image}, \u5C3E\u5E27: ${!!end_frame_image}), resolution: ${resolution}`);
    requestData = {
      params: {
        aigc_features: "app_lip_sync",
        web_version: profile.webVersion,
        da_version: profile.draftVersion
      },
      data: {
        extend: {
          root_model: model,
          m_video_commerce_info: {
            benefit_type: getVideoBenefitType(model, profile),
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          },
          m_video_commerce_info_list: [{
            benefit_type: getVideoBenefitType(model, profile),
            resource_id: "generate_video",
            resource_id_type: "str",
            resource_sub_type: "aigc"
          }]
        },
        submit_id: clientSubmitId,
        metrics_extra: metricsExtra,
        draft_content: JSON.stringify({
          type: "draft",
          id: util_default.uuid(),
          min_version: "3.0.5",
          min_features: [],
          is_from_tsn: true,
          version: profile.draftVersion,
          main_component_id: componentId,
          component_list: [{
            type: "video_base_component",
            id: componentId,
            min_version: "1.0.0",
            aigc_mode: "workbench",
            metadata: {
              type: "",
              id: util_default.uuid(),
              created_platform: 3,
              created_platform_version: "",
              created_time_in_ms: Date.now().toString(),
              created_did: ""
            },
            generate_type: "gen_video",
            abilities: {
              type: "",
              id: util_default.uuid(),
              gen_video: {
                id: util_default.uuid(),
                type: "",
                text_to_video_params: {
                  type: "",
                  id: util_default.uuid(),
                  video_gen_inputs: [{
                    type: "",
                    id: util_default.uuid(),
                    min_version: "3.0.5",
                    prompt,
                    video_mode: 2,
                    fps: 24,
                    duration_ms: durationMs,
                    ...supportsResolution ? { resolution } : {},
                    first_frame_image,
                    end_frame_image,
                    idip_meta_list: []
                  }],
                  video_aspect_ratio: ratio,
                  seed: Math.floor(Math.random() * 4294967296),
                  model_req_key: model,
                  priority: 0
                },
                video_task_extra: metricsExtra
              }
            },
            process_type: 1
          }]
        }),
        http_common_info: {
          aid: getAssistantId(regionInfo)
        }
      }
    };
  }
  const videoReferer = profile.videoReferer;
  if (isVideoDebug()) {
    const dc = JSON.parse(requestData.data.draft_content);
    const p = (_j = (_i = (_h = (_g = dc.component_list) == null ? void 0 : _g[0]) == null ? void 0 : _h.abilities) == null ? void 0 : _i.gen_video) == null ? void 0 : _j.text_to_video_params;
    logger_default.info(`[video-debug] params=${JSON.stringify(requestData.params)} extend=${JSON.stringify(requestData.data.extend)} draft.version=${dc.version} min_version=${dc.min_version} model_req_key=${p == null ? void 0 : p.model_req_key} ratio=${p == null ? void 0 : p.video_aspect_ratio} duration_ms=${(_l = (_k = p == null ? void 0 : p.video_gen_inputs) == null ? void 0 : _k[0]) == null ? void 0 : _l.duration_ms} aid=${(_m = requestData.data.http_common_info) == null ? void 0 : _m.aid}`);
    logger_default.info(`[video-debug] metrics_extra=${requestData.data.metrics_extra}`);
  }
  let aigc_data;
  try {
    ({ aigc_data } = await request(
      "post",
      "/mweb/v1/aigc_draft/generate",
      refreshToken,
      {
        ...requestData,
        headers: { Referer: videoReferer },
        // Seedance 2.0 提交可选走 a_bogus 浏览器签名通道（ABOGUS_BROWSER_ENABLED=1 时生效）
        useAbogusBrowser: is40Pro || is40
      }
    ));
  } catch (err) {
    const msg = String((err == null ? void 0 : err.message) || "");
    if (/1019|shark|4013|异常行为/.test(msg)) {
      logger_default.error(`[video] \u63D0\u4EA4\u7591\u4F3C\u88AB\u98CE\u63A7/\u7B7E\u540D\u6821\u9A8C\u62E6\u622A (region=${regionKey(regionInfo)}, req_key=${model})\u3002\u53EF\u5C1D\u8BD5\u8BBE\u7F6E ABOGUS_BROWSER_ENABLED=1 \u542F\u7528\u6D4F\u89C8\u5668\u7B7E\u540D\u901A\u9053\u3002\u539F\u59CB\u9519\u8BEF: ${msg}`);
    }
    throw err;
  }
  if (isVideoDebug()) logger_default.info(`[video-debug] aigc_data=${JSON.stringify(redact(aigc_data)).substring(0, 1e3)}`);
  if (!aigc_data) throw new APIException(exceptions_default.API_VIDEO_GENERATION_FAILED, "\u63D0\u4EA4\u54CD\u5E94\u7F3A\u5C11 aigc_data");
  const historyId = aigc_data.history_record_id;
  if (!historyId)
    throw new APIException(exceptions_default.API_IMAGE_GENERATION_FAILED, "\u8BB0\u5F55ID\u4E0D\u5B58\u5728");
  if (submitOnly) return { historyId: String(historyId), submitId: clientSubmitId, model };
  logger_default.info(`\u89C6\u9891\u751F\u6210\u4EFB\u52A1\u5DF2\u63D0\u4EA4\uFF0Chistory_id: ${historyId}\uFF0C\u7B49\u5F85\u751F\u6210\u5B8C\u6210...`);
  await new Promise((resolve) => setTimeout(resolve, 5e3));
  const maxPollCount = 900;
  let pollAttempts = 0;
  const poller = new SmartPoller({
    maxPollCount,
    pollInterval: 2e4,
    // 20秒基础间隔
    expectedItemCount: 1,
    type: "video",
    timeoutSeconds: 3600
    // 60分钟超时
  });
  const { result: pollingResult, data: finalHistoryData } = await poller.poll(async () => {
    var _a3, _b3, _c2, _d2, _e2, _f2, _g2, _h2, _i2, _j2, _k2, _l2, _m2, _n2, _o2;
    pollAttempts++;
    const result = await request("post", "/mweb/v1/get_history_by_ids", refreshToken, {
      data: {
        history_ids: [historyId]
      }
    });
    if (!result[historyId]) {
      logger_default.warn(`API\u672A\u8FD4\u56DE\u5386\u53F2\u8BB0\u5F55 (\u8F6E\u8BE2\u7B2C${pollAttempts}\u6B21)\uFF0ChistoryId: ${historyId}\uFF0C\u7EE7\u7EED\u7B49\u5F85...`);
      return {
        status: {
          status: 20,
          // PROCESSING
          itemCount: 0,
          historyId
        },
        data: { status: 20, item_list: [] }
      };
    }
    const historyData = result[historyId];
    const currentStatus = historyData.status;
    const currentFailCode = historyData.fail_code;
    const currentItemList = historyData.item_list || [];
    const finishTime = ((_a3 = historyData.task) == null ? void 0 : _a3.finish_time) || 0;
    if (currentItemList.length > 0) {
      const tempVideoUrl = ((_e2 = (_d2 = (_c2 = (_b3 = currentItemList[0]) == null ? void 0 : _b3.common_attr) == null ? void 0 : _c2.transcoded_video) == null ? void 0 : _d2.origin) == null ? void 0 : _e2.video_url) || ((_i2 = (_h2 = (_g2 = (_f2 = currentItemList[0]) == null ? void 0 : _f2.video) == null ? void 0 : _g2.transcoded_video) == null ? void 0 : _h2.origin) == null ? void 0 : _i2.video_url) || ((_k2 = (_j2 = currentItemList[0]) == null ? void 0 : _j2.video) == null ? void 0 : _k2.play_url) || ((_m2 = (_l2 = currentItemList[0]) == null ? void 0 : _l2.video) == null ? void 0 : _m2.download_url) || ((_o2 = (_n2 = currentItemList[0]) == null ? void 0 : _n2.video) == null ? void 0 : _o2.url);
      if (tempVideoUrl) {
        logger_default.info(`\u68C0\u6D4B\u5230\u89C6\u9891URL: ${tempVideoUrl}`);
      }
    }
    return {
      status: {
        status: currentStatus,
        failCode: currentFailCode,
        itemCount: currentItemList.length,
        finishTime,
        historyId
      },
      data: historyData
    };
  }, historyId);
  const item_list = finalHistoryData.item_list || [];
  const itemId = ((_n = item_list == null ? void 0 : item_list[0]) == null ? void 0 : _n.item_id) || ((_o = item_list == null ? void 0 : item_list[0]) == null ? void 0 : _o.id) || ((_p = item_list == null ? void 0 : item_list[0]) == null ? void 0 : _p.local_item_id) || ((_r = (_q = item_list == null ? void 0 : item_list[0]) == null ? void 0 : _q.common_attr) == null ? void 0 : _r.id);
  if (itemId) {
    try {
      const hqVideoUrl = await fetchHighQualityVideoUrl(String(itemId), refreshToken);
      if (hqVideoUrl) {
        logger_default.info(`\u89C6\u9891\u751F\u6210\u6210\u529F\uFF08\u9AD8\u8D28\u91CF\uFF09\uFF0CURL: ${hqVideoUrl}\uFF0C\u603B\u8017\u65F6: ${pollingResult.elapsedTime}\u79D2`);
        return hqVideoUrl;
      }
    } catch (error) {
      logger_default.warn(`\u83B7\u53D6\u9AD8\u8D28\u91CF\u89C6\u9891URL\u5931\u8D25\uFF0C\u5C06\u4F7F\u7528\u9884\u89C8URL\u4F5C\u4E3A\u56DE\u9000: ${error.message}`);
    }
  } else {
    logger_default.warn(`\u672A\u80FD\u4ECEitem_list\u4E2D\u63D0\u53D6item_id\uFF0C\u5C06\u4F7F\u7528\u9884\u89C8URL\u3002item_list[0]\u952E: ${(item_list == null ? void 0 : item_list[0]) ? Object.keys(item_list[0]).join(", ") : "\u65E0"}`);
  }
  let fallbackVideoUrl = (item_list == null ? void 0 : item_list[0]) ? extractVideoUrl(item_list[0]) : null;
  if (!fallbackVideoUrl) {
    logger_default.error(`\u672A\u80FD\u83B7\u53D6\u89C6\u9891URL\uFF0Citem_list: ${JSON.stringify(item_list)}`);
    throw new APIException(exceptions_default.API_IMAGE_GENERATION_FAILED, "\u672A\u80FD\u83B7\u53D6\u89C6\u9891URL\uFF0C\u8BF7\u7A0D\u540E\u67E5\u770B");
  }
  logger_default.info(`\u89C6\u9891\u751F\u6210\u6210\u529F\uFF0CURL: ${fallbackVideoUrl}\uFF0C\u603B\u8017\u65F6: ${pollingResult.elapsedTime}\u79D2`);
  return fallbackVideoUrl;
}

// src/storydock-bridge.ts
async function execute(m) {
  var _a2, _b2, _c, _d, _e;
  const b = m.body || {};
  if (m.method === "runtime") return { available: true, models: ["jimeng-video-seedance-2.0", "jimeng-video-seedance-2.0-fast"] };
  if (m.method === "credit") return getCredit(m.token);
  if (m.method === "submit") return generateVideo(b.model, b.prompt, { ratio: b.ratio, resolution: "720p", duration: b.duration, files: b.files || {}, functionMode: b.references ? "omni_reference" : "first_last_frames", submitOnly: true, clientSubmitId: b.submitId }, m.token);
  if (m.method === "query") {
    const id = String(b.historyId || b.submitId);
    const result = await request("post", "/mweb/v1/get_history_by_ids", m.token, { data: { history_ids: [id] } });
    const h = result[id] || Object.values(result).find((v) => {
      var _a3;
      return ((_a3 = v == null ? void 0 : v.task) == null ? void 0 : _a3.submit_id) === b.submitId;
    });
    if (!h) return { status: "pending", found: false };
    const url = ((_a2 = h.item_list) == null ? void 0 : _a2[0]) && extractVideoUrl(h.item_list[0]);
    if (url) return { status: "succeeded", historyId: h.history_record_id || id, url, model: ((_c = (_b2 = h.task) == null ? void 0 : _b2.original_input) == null ? void 0 : _c.model_req_key) || null };
    if (h.status === 30 || ((_d = h.task) == null ? void 0 : _d.status) === 30 || h.fail_code) return { status: "failed", code: h.fail_code || ((_e = h.task) == null ? void 0 : _e.fail_code) };
    return { status: "pending", found: true };
  }
  if (m.method === "download") {
    const u = new URL(b.url);
    if (u.protocol !== "https:" || !/(^|\.)(capcutcdn-us\.com|capcutcdn\.com|tiktokcdn-us\.com|byteoversea\.com|byteimg\.com|bytevcloudapi\.com)$/.test(u.hostname)) throw Error("Unsupported media host");
    const agent = process.env.INTL_PROXY_URL ? new import_https_proxy_agent2.HttpsProxyAgent(process.env.INTL_PROXY_URL) : void 0;
    const r = await import_axios6.default.get(b.url, { responseType: "arraybuffer", timeout: 12e4, maxContentLength: 500 * 1024 * 1024, ...agent ? { httpsAgent: agent, proxy: false } : {} });
    await import_promises.default.writeFile(b.output, Buffer.from(r.data), { mode: 384 });
    return { size: r.data.length };
  }
  throw Error("Unknown bridge command");
}
var lines = import_node_readline.default.createInterface({ input: process.stdin });
var chain = Promise.resolve();
lines.on("line", (line) => {
  chain = chain.then(async () => {
    let m;
    try {
      m = JSON.parse(line);
      const data = await execute(m);
      process.stdout.write("@@STORYDOCK@@" + JSON.stringify({ id: m.id, data }) + "\n");
    } catch (e) {
      process.stdout.write("@@STORYDOCK@@" + JSON.stringify({ id: m == null ? void 0 : m.id, error: String((e == null ? void 0 : e.message) || "Bridge failed").replace(/[a-f0-9]{32,}/gi, "[redacted]").slice(0, 500) }) + "\n");
    }
  });
});
lines.on("close", () => {
  chain.finally(async () => {
    await closeAllBrowserSessions();
    process.exit(0);
  });
});
