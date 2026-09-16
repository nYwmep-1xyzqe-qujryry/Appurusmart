module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#07865F",
          dark: "#174D42",
          darker: "#174D42",
          light: "#07865F",
          lighter: "#E8F4EF",
          muted: "#E8F4EF",
          soft: "#F4F8F5",
        },
        brand: {
          DEFAULT: "#07865F",
          yellow: "#D5A72C",
          yellowDark: "#7A5C14",
          yellowSoft: "#F8E8B0",
        },
        surface: "#ffffff",
        surfaceMuted: "#F8FCFA",
        appbg: "#F4F8F5",
        line: "#DCE8E3",
        ink: "#263632",
        muted: "#5F7069",
        soft: "#9AA9A3",
        danger: "#D92D20",
        warning: "#8A6412",
      },
    },
  },
  plugins: [],
};
