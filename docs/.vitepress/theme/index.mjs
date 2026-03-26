import DefaultTheme from "vitepress/theme";
import HeroTerminal from "./HeroTerminal.vue";
import { h } from "vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(HeroTerminal),
    });
  },
};
