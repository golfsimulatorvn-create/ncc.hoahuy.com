import type { Config } from "tailwindcss";

// Mau theo thuong hieu Hoa Huy (docs/thuong-hieu.md cua CRM): cam #F57507 CHI cho vach nhan / muc dang chon,
// KHONG dat chu trang len tren (tuong phan 2,83:1). Nen co chu trang dung `accent` (#C25200).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#F57507",
        accent: { DEFAULT: "#C25200", dark: "#8A3A00" },
        forest: { DEFAULT: "#17332B", soft: "#EAF1EE", text: "#E7EFEA", mute: "#B7CBC2" },
        ground: "#F6F4F0",
        surface: { DEFAULT: "#FFFFFF", sunk: "#FAF8F4" },
        line: { DEFAULT: "#E4DFD6", strong: "#BDB6A8" },
        ink: { DEFAULT: "#1C1B19", 2: "#4A463F", muted: "#6B665F" },
        ok: { bg: "#E1F1E6", fg: "#1E5B32" },
        info: { bg: "#E3EEF9", fg: "#1F4E79" },
        warn: { bg: "#FFF4DC", fg: "#5A3D00", line: "#F0D58A" },
        part: { bg: "#FBEBD0", fg: "#7A4A00" },
        done: { bg: "#E8E6E1", fg: "#3A3732" },
        danger: { bg: "#FBE4E0", fg: "#8A2D00" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
