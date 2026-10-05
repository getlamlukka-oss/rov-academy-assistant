// สีและฟอนต์ของ Academy ใช้ร่วมกันทุกหน้า
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101923",
        panel: "#18232f",
        cyan: "#4fe0d2",
        muted: "#93a4b8",
      },
      fontFamily: { sans: ["Tahoma", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
