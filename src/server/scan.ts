import net from "node:net";
import path from "node:path";
import { env } from "./env";

/**
 * Kiem tra tep NCC tai len truoc khi chuyen sang CRM (specs/054, T034): duoi cho phep, dung luong, byte dau khop duoi,
 * va quet virus bang clamd (giao thuc INSTREAM) khi co cau hinh. CRM kiem lai duoi/dung luong/byte dau (khong tin cong).
 */
export const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "xlsx", "xls", "csv"] as const;

export class UploadRejected extends Error {
  code: "ext" | "size" | "empty" | "magic" | "virus" | "scanner";
  constructor(code: UploadRejected["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function magicMatches(ext: string, buf: Uint8Array): boolean {
  const is = (...b: number[]) => b.every((x, i) => buf[i] === x);
  switch (ext) {
    case "pdf": return is(0x25, 0x50, 0x44, 0x46);
    case "png": return is(0x89, 0x50, 0x4e, 0x47);
    case "jpg": case "jpeg": return is(0xff, 0xd8, 0xff);
    case "xlsx": return is(0x50, 0x4b, 0x03, 0x04);
    case "xls": return is(0xd0, 0xcf, 0x11, 0xe0);
    case "csv": return !buf.subarray(0, 4096).includes(0);
    default: return false;
  }
}

/** Gui buffer toi clamd (INSTREAM). Tra ve "OK" hoac ten virus. Loi ket noi => UploadRejected("scanner"): tu choi (an toan). */
export function clamdScan(buf: Uint8Array): Promise<"OK" | string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: process.env.CLAMD_HOST!, port: Number(process.env.CLAMD_PORT ?? 3310) });
    let out = "";
    sock.setTimeout(30_000, () => { sock.destroy(); reject(new UploadRejected("scanner", "Không quét được tệp, vui lòng thử lại.")); });
    sock.on("error", () => reject(new UploadRejected("scanner", "Không quét được tệp, vui lòng thử lại.")));
    sock.on("data", (d) => { out += d.toString("utf8"); });
    sock.on("end", () => {
      const m = /stream:\s*(.+?)\s*(FOUND|OK|ERROR)/.exec(out.replace(/\0/g, ""));
      if (m?.[2] === "OK") resolve("OK");
      else if (m?.[2] === "FOUND") resolve(m[1]);
      else reject(new UploadRejected("scanner", "Không quét được tệp, vui lòng thử lại."));
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = Buffer.from(buf.subarray(i, i + 64 * 1024));
        const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4)); // ket thuc
    });
  });
}

/** Kiem tra day du; tra ve buffer + phan mo rong chuan hoa neu hop le. */
export async function checkUpload(file: File): Promise<{ buf: Buffer; ext: string }> {
  const ext = path.extname(file.name).slice(1).toLowerCase();
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) throw new UploadRejected("ext", `Tệp "${file.name}" không đúng định dạng cho phép.`);
  if (file.size === 0) throw new UploadRejected("empty", "Tệp rỗng.");
  if (file.size > env.maxFileMb * 1024 * 1024) throw new UploadRejected("size", `Tệp "${file.name}" vượt quá giới hạn ${env.maxFileMb} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!magicMatches(ext, buf)) throw new UploadRejected("magic", `Nội dung tệp "${file.name}" không khớp với đuôi .${ext}.`);
  if (env.clamdConfigured) {
    const r = await clamdScan(buf);
    if (r !== "OK") throw new UploadRejected("virus", `Tệp "${file.name}" bị chặn vì nghi chứa mã độc.`);
  }
  return { buf, ext };
}
