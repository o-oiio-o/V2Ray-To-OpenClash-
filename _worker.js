export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { AUTH_USER, AUTH_PASS, V2_DATA, SUB_TOKEN } = env;

    // 1. Define your custom path here
    const mySubPath = "/scfg";

    // --- 1. Security Check for Subscription ---
    if (url.pathname === mySubPath) {
      const token = url.searchParams.get("token");
      const ua = request.headers.get("User-Agent") || "";

      // Check 1: Token verification
      if (!SUB_TOKEN || token !== SUB_TOKEN) {
        return new Response("Unauthorized: Invalid Token", { status: 403 });
      }

      // Check 2: Simple UA Filter (Optional: Only allow Clash-like clients)
      // If you want to be stricter, uncomment the lines below:
      /*
      if (!ua.toLowerCase().includes("clash") && !ua.toLowerCase().includes("mihomo")) {
        return new Response("Access Denied: Please use Clash client", { status: 403 });
      }
      */

      const rawData = await V2_DATA.get("nodes_txt") || "";
      const yaml = convertToYaml(rawData, url.host);
      
      return new Response(yaml, {
        headers: { 
          "Content-Type": "text/yaml; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow" // Prevent search engines
        }
      });
    }

    // --- 2. Admin Auth Logic ---
    const cookie = request.headers.get("Cookie") || "";
    const isAuthed = cookie.includes(`auth=true`);

    if (url.pathname === "/login" && request.method === "POST") {
      const formData = await request.formData();
      if (formData.get("user") === AUTH_USER && formData.get("pass") === AUTH_PASS) {
        return new Response("Login Success", {
          status: 302,
          headers: { "Set-Cookie": "auth=true; Path=/; HttpOnly; SameSite=Lax", "Location": "/" }
        });
      }
      return new Response("Invalid Credentials", { status: 401 });
    }

    if (!isAuthed) {
      return new Response(renderLoginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // --- 3. Admin Logic ---
    if (url.pathname === "/save" && request.method === "POST") {
      const formData = await request.formData();
      const content = formData.get("content");
      await V2_DATA.put("nodes_txt", content);
      return new Response("Saved", { status: 302, headers: { "Location": "/" } });
    }

    const currentNodes = await V2_DATA.get("nodes_txt") || "";
    // Display Sub URL with Token
    const subUrl = `${url.protocol}//${url.host}${mySubPath}?token=${SUB_TOKEN || 'SET_YOUR_TOKEN_IN_ENV'}`;
    
    return new Response(renderAdminPage(currentNodes, subUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
};


// --- 3. Conversion Logic (V2Ray TXT -> Clash YAML) ---
function convertToYaml(txt, host) {
  let content = txt.trim();
  // Base64 Decode
  if (!content.startsWith("vmess://") && !content.startsWith("vless://") && !content.startsWith("ss://") && !content.startsWith("trojan://")) {
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
      } else if (line.startsWith("vless://") || line.startsWith("trojan://") || line.startsWith("ss://")) {
        const url = new URL(line);
        const protocol = line.split("://")[0];
        proxy = {
          name: decodeURIComponent(url.hash.replace("#", "")) || `${protocol}_node`,
          type: protocol,
          server: url.hostname,
          port: parseInt(url.port),
          uuid: protocol === "vless" ? url.username : undefined,
          password: (protocol === "trojan" || protocol === "ss") ? url.username : undefined,
          tls: protocol !== "ss",
          "skip-cert-verify": true,
          sni: url.searchParams.get("sni") || url.hostname,
          network: url.searchParams.get("type") || "tcp"
        };
        if (url.searchParams.get("type") === "ws") {
          proxy["ws-opts"] = { path: url.searchParams.get("path") || "/", headers: { Host: url.searchParams.get("host") || "" } };
        }
      }

      if (proxy) {
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
  - name: 🚀 Proxy Select
    type: select
    proxies:
      - ⚡ Auto Select
${names}
  - name: ⚡ Auto Select
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
${names}

rules:
  - GEOIP,CN,DIRECT
  - MATCH,🚀 Proxy Select
`;
}

// --- 4. Page Templates (English Version) ---
function renderLoginPage() {
  return `<!DOCTYPE html><html><head><title>Login</title><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-100 flex items-center justify-center h-screen">
    <form action="/login" method="POST" class="bg-white p-8 rounded shadow-md w-80">
      <h2 class="text-xl font-bold mb-4">Node Manager Login</h2>
      <input type="text" name="user" placeholder="Username" class="w-full border p-2 mb-2 rounded shadow-sm">
      <input type="password" name="pass" placeholder="Password" class="w-full border p-2 mb-4 rounded shadow-sm">
      <button class="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded transition">Login</button>
    </form>
  </body></html>`;
}

function renderAdminPage(content, subUrl) {
  return `<!DOCTYPE html><html><head><title>Node Manager</title><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-50 p-4">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-4">V2Ray Node List Management</h1>
      <form action="/save" method="POST">
        <textarea name="content" class="w-full h-96 p-4 border rounded mb-4 font-mono text-sm shadow-sm focus:ring-2 focus:ring-blue-400 outline-none" placeholder="Paste vmess:// vless:// ss:// trojan:// links here...">${content}</textarea>
        <div class="flex gap-4 mb-8">
          <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded shadow transition font-medium">Save & Update Sub</button>
          <button type="button" onclick="copySub()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded shadow transition font-medium">Copy Sub URL</button>
        </div>
      </form>
      <div class="bg-gray-200 p-4 rounded-lg border border-gray-300">
        <p class="text-sm font-bold text-gray-700 mb-1">Subscription URL:</p>
        <code id="subUrl" class="text-blue-700 break-all text-sm">${subUrl}</code>
      </div>
    </div>
    <script>
      function copySub() {
        const url = document.getElementById('subUrl').innerText;
        navigator.clipboard.writeText(url).then(() => {
          alert("URL copied to clipboard!");
        });
      }
    </script>
  </body></html>`;
}

