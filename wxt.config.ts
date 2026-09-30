import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Sampler',
    description: 'Click, listen, click, trim, loop, export.',
    minimum_chrome_version: '127',
    permissions: ['tabCapture', 'offscreen'],
    action: {
      default_title: 'Click to capture tab audio',
      default_icon: {
        16: 'icons/idle-16.png',
        32: 'icons/idle-32.png',
      },
    },
  },
});
