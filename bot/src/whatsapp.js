import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const AUTHORIZED_NUMBERS = new Set(
  (process.env.AUTHORIZED_WHATSAPP_NUMBERS || process.env.ALLOWED_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
);

const DAILY_LIMIT = parseInt(process.env.DAILY_REQUEST_LIMIT || "10", 10);
const requestCounts = new Map();
const pendingTopics = new Map(); // número → { topic, status, steps }

function checkRateLimit(from) {
  const today = new Date().toISOString().split("T")[0];
  const key = `${from}:${today}`;
  const count = requestCounts.get(key) || 0;
  if (count >= DAILY_LIMIT) return false;
  requestCounts.set(key, count + 1);
  return true;
}

export class WhatsAppBot {
  constructor(onCommand) {
    this.onCommand = onCommand;
    this.client = null;
  }

  isAuthorized(from) {
    if (AUTHORIZED_NUMBERS.size === 0) return true;
    const number = from.replace(/\D/g, "");
    for (const allowed of AUTHORIZED_NUMBERS) {
      if (number.endsWith(allowed.replace(/\D/g, ""))) return true;
    }
    return false;
  }

  async start() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: "medblog-client" }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    });

    this.client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Escaneie o QR Code com seu WhatsApp\n");
    });

    this.client.on("ready", () => {
      console.log("✅ WhatsApp conectado!");
      console.log("📲 Comandos: /novo <tema>, /status <slug>, /aprovar <slug>, /cancelar <slug>\n");
    });

    this.client.on("message", async (msg) => {
      if (msg.from.includes("status") || msg.fromMe) return;
      if (msg.from.endsWith("@g.us")) {
        console.log(`⛔ Mensagem ignorada de grupo: ${msg.from}`);
        return;
      }
      if (!this.isAuthorized(msg.from)) {
        console.warn(`⛔ Mensagem não autorizada de ${msg.from}`);
        return;
      }
      if (!checkRateLimit(msg.from)) {
        console.warn(`⛔ Limite diário excedido para ${msg.from}`);
        await msg.reply(`❌ Limite diário de ${DAILY_LIMIT} solicitações atingido.`);
        return;
      }

      await this._handleMessage(msg);
    });

    this.client.on("disconnected", (reason) => {
      console.log("❌ WhatsApp desconectado:", reason);
    });

    await this.client.initialize();
    return this;
  }

  async _handleMessage(msg) {
    const body = msg.body.trim();
    const reply = (text) => msg.reply(text);

    // Comandos
    if (body.startsWith("/novo ")) {
      const topic = body.slice(6).trim();
      if (!topic) {
        await reply("❌ Use: /novo <tema do artigo>");
        return;
      }
      const number = msg.from;
      pendingTopics.set(number, {
        topic,
        status: "research-pending",
        steps: { research: false, draft: false, images: false, automatedGate: false, published: false },
      });
      await reply(
        `📝 *Tema registrado:* ${topic}\n\n` +
        `Próxima etapa: preencher a ficha de pesquisa.\n\n` +
        `Status:\n` +
        `🟡 Pesquisa pendente\n` +
        `⚪ Rascunho\n` +
        `⚪ Imagens\n` +
        `⚪ Gate automático\n` +
        `⚪ Publicação\n\n` +
        `Use /status ${topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")} para acompanhar.`
      );
      if (this.onCommand) {
        await this.onCommand({ command: "novo", args: { topic }, from: msg.from, reply });
      }
      return;
    }

    if (body.startsWith("/status ")) {
      const slug = body.slice(8).trim();
      await reply(`📊 *Status de "${slug || "tema"}":*\n\n🔍 Consulte o repositório para ver o progresso.`);
      return;
    }

    if (body.startsWith("/aprovar ")) {
      const slug = body.slice(9).trim();
      await reply(`ℹ️ A aprovação manual foi desativada. *${slug || "O artigo"}* só será publicado quando o gate editorial automatizado emitir recibo, score suficiente e zero bloqueadores.`);
      return;
    }

    if (body.startsWith("/cancelar ")) {
      const slug = body.slice(10).trim();
      const number = msg.from;
      pendingTopics.delete(number);
      await reply(`🗑️ *${slug || "Tema"}* cancelado.`);
      return;
    }

    if (body === "/ajuda" || body === "/help") {
      await reply(
        "🤖 *Comandos do The Biker Blog Bot:*\n\n" +
        `/novo <tema> — Registrar novo tema\n` +
        `/status <slug> — Ver status do artigo\n` +
        `/aprovar <slug> — Consultar a política; não libera publicação manual\n` +
        `/cancelar <slug> — Cancelar tema\n` +
        `/ajuda — Mostrar esta mensagem`
      );
      return;
    }

    // Mensagem não reconhecida — não aciona publicação nem altera o gate
    console.log(`ℹ️  Mensagem ignorada (sem comando): "${body.substring(0, 60)}..."`);
  }

  async sendMessage(to, text) {
    if (this.client) await this.client.sendMessage(to, text);
  }

  async stop() {
    if (this.client) await this.client.destroy();
  }
}
