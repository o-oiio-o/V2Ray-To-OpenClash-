export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { AUTH_USER, AUTH_PASS, V2_DATA } = env;

    // --- 1. 简易登录验证逻辑 ---
    const cookie = request.headers.get("Cookie") || "";
    const isAuthed = cookie.includes(`auth=true`);

    // 订阅链接接口 (无需登录，方便 OpenClash 调用)
    if (url.pathname === "/sub") {
      const rawData = await V2_DATA.get("nodes_txt") || "";
      const yaml = convertToYaml(rawData, url.host);
      return new Response(yaml, {
        headers: { "Content-Type": "text/yaml; charset=utf-8" }
      });
    }

    // 登录处理
    if (url.pathname === "/login" && request.method === "POST") {
      const formData = await request.formData();
      if (formData.get("user") === AUTH_USER && formData.get("pass") === AUTH_PASS) {
        return new Response("Login Success", {
          status: 302,
          headers: { "Set-Cookie": "auth=true; Path=/; HttpOnly", "Location": "/" }
        });
      }
      return new Response("Invalid Credentials", { status: 401 });
    }

    if (!isAuthed) {
      return new Response(renderLoginPage(), { headers: { "Content-Type": "text/html" } });
    }

    // --- 2. 管理页面逻辑 ---
    if (url.pathname === "/save" && request.method === "POST") {
      const formData = await request.formData();
      const content = formData.get("content");
      await V2_DATA.put("nodes_txt", content);
      return new Response("Saved", { status: 302, headers: { "Location": "/" } });
    }

    // 主页：编辑节点
    const currentNodes = await V2_DATA.get("nodes_txt") || "";
    const subUrl = `${url.protocol}//${url.host}/sub`;
    return new Response(renderAdminPage(currentNodes, subUrl), {
      headers: { "Content-Type": "text/html" }
    });
  }
};

// --- 3. 转换逻辑 (V2Ray TXT -> Clash YAML) ---
function convertToYaml(txt, host) {
  let content = txt.trim();
  // Base64 解码处理
  if (!content.startsWith("vmess://") && !content.startsWith("vless://")) {
    try { content = atob(content); } catch (e) {}
  }

  const lines = content.split(/\r?\n/);
  const proxies = [];
  const nameCounter = {};

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    try {
      let proxy = null;
      if (line.startsWith("vmess://")) {
        const data = JSON.parse(atob(line.replace("vmess://", "")));
        proxy = {
          name: data.ps || "vmess_node",
          type: "vmess",
          server: data.add,
          port: parseInt(data.port),
          uuid: data.id,
          alterId: parseInt(data.aid || 0),
          cipher: "auto",
          tls: data.tls === "tls",
          network: data.net || "tcp",
          "ws-opts": data.net === "ws" ? { path: data.path || "/", headers: { Host: data.host || "" } } : undefined
        };
      } else if (line.startsWith("vless://") || line.startsWith("trojan://")) {
        const url = new URL(line);
        const protocol = line.split("://")[0];
        proxy = {
          name: decodeURIComponent(url.hash.replace("#", "")) || `${protocol}_node`,
          type: protocol,
          server: url.hostname,
          port: parseInt(url.port),
          uuid: protocol === "vless" ? url.username : undefined,
          password: protocol === "trojan" ? url.username : undefined,
          tls: true,
          "skip-cert-verify": true,
          sni: url.searchParams.get("sni") || url.hostname,
          network: url.searchParams.get("type") || "tcp"
        };
        if (url.searchParams.get("type") === "ws") {
          proxy["ws-opts"] = { path: url.searchParams.get("path") || "/", headers: { Host: url.searchParams.get("host") || "" } };
        }
      }

      if (proxy) {
        // 重名去重逻辑
        if (nameCounter[proxy.name] !== undefined) {
          nameCounter[proxy.name]++;
          proxy.name = `${proxy.name}_${nameCounter[proxy.name]}`;
        } else {
          nameCounter[proxy.name] = 0;
        }
        proxies.push(proxy);
      }
    } catch (e) {}
  });

  // 构建简易 YAML 字符串 (避免引入大型库)
  const proxyList = proxies.map(p => `  - ${JSON.stringify(p)}`).join("\n");
  const names = proxies.map(p => `      - "${p.name}"`).join("\n");

  return `
port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info
external-controller: 0.0.0.0:9090
secret: ""
external-ui: ui

proxies:
${proxyList}

proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ⚡ 自动选择
${names}
  - name: ⚡ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
${names}

rules:
  - GEOIP,CN,DIRECT
  - MATCH,🚀 节点选择
`;
}

// --- 4. 页面模板 ---
function renderLoginPage() {
  return `<!DOCTYPE html><html><head><title>Login</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-100 flex items-center justify-center h-screen">
    <form action="/login" method="POST" class="bg-white p-8 rounded shadow-md w-80">
      <h2 class="text-xl font-bold mb-4">Node Manager Login</h2>
      <input type="text" name="user" placeholder="Username" class="w-full border p-2 mb-2 rounded">
      <input type="password" name="pass" placeholder="Password" class="w-full border p-2 mb-4 rounded">
      <button class="w-full bg-blue-500 text-white py-2 rounded">Login</button>
    </form>
  </body></html>`;
}

function renderAdminPage(content, subUrl) {
  return `<!DOCTYPE html><html><head><title>Node Manager</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-50 p-4">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-4">V2Ray 节点列表管理</h1>
      <form action="/save" method="POST">
        <textarea name="content" class="w-full h-96 p-4 border rounded mb-4 font-mono text-sm" placeholder="粘贴 vmess:// vless:// 链接，每行一个">${content}</textarea>
        <div class="flex gap-4 mb-8">
          <button type="submit" class="bg-green-600 text-white px-6 py-2 rounded shadow">保存并更新订阅</button>
          <button type="button" onclick="copySub()" class="bg-blue-600 text-white px-6 py-2 rounded shadow">复制订阅链接</button>
        </div>
      </form>
      <div class="bg-gray-200 p-4 rounded break-all">
        <p class="text-sm font-bold">当前订阅链接：</p>
        <code id="subUrl">${subUrl}</code>
      </div>
    </div>
    <script>
      function copySub() {
        navigator.clipboard.writeText("${subUrl}");
        alert("订阅链接已复制！请粘贴到 OpenClash 订阅地址中。");
      }
    </script>
  </body></html>`;
}