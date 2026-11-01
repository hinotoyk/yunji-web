/** @type {import('tailwindcss').Config} */
module.exports = {
  /* 暗色模式扩展点预留（2026-10-30 UI 审查 §1）：当前站点仅亮色，未实现任何 dark: 变体。
   * 这里先把开关挂成 class 策略 —— 将来接入只需给 <html> 加 .dark 并逐组件补 dark: 前缀，
   * 不必再改构建配置。★ 现在不要给组件加 dark: 类（无配套深色 token，加了会得到半成品观感）。 */
  darkMode: 'class',
  content: ['./index.html', './pages/**/*.html', './pages/**/*.js', './public/**/*.js'],
  theme: {
    extend: {
      /* 语义间距令牌（2026-10-30 UI 审查 §2）：把全站反复出现的四档间距命名化，
       * 替代各页 <style> 里散落的 padding:12px/16px/18px 硬编码。
       * 只增不改 —— 不覆盖 Tailwind 默认 spacing scale（p-4/gap-2 等照常可用）。 */
      spacing: {
        section: '48px',   /* 大分区间距：<section class="mb-section"> */
        card: '24px',      /* 卡片内边距：p-card */
        row: '12px',       /* 行间距 / 紧凑卡片内距 */
        tight: '8px'       /* 徽章与文字、图标与标签 */
      },
      colors: {
        background: '#ffffff',
        foreground: '#0a0a0a',
        card: '#ffffff',
        'card-foreground': '#0a0a0a',
        popover: '#ffffff',
        'popover-foreground': '#0a0a0a',
        primary: '#0aa7a0',
        'primary-foreground': '#ffffff',
        secondary: '#f5f5f5',
        'secondary-foreground': '#171717',
        muted: '#f5f5f5',
        'muted-foreground': '#737373',
        accent: '#e6f6f5',
        'accent-foreground': '#0b6b64',
        destructive: '#ef4444',
        'destructive-foreground': '#fafafa',
        border: '#e5e5e5',
        input: '#e5e5e5',
        ring: '#0aa7a0',
        chart1: '#0aa7a0',
        chart2: '#0f8fd6',
        chart3: '#e8742a',
        /* chart4 当前全站零引用（2026-10-30 UI 审查核实：grep 无任何 bg-/text-/border-chart4），
         * 原值与 chart2 完全相同（#0f8fd6）属历史遗留别名。保留键位但改为可辨识的浅蓝，
         * 避免后人误当作「与 chart2 同色的别名」而在图表里并列使用导致两系列不可分。 */
        chart4: '#5b9bd5',
        chart5: '#7cc8c5'
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Noto Sans CJK SC"', 'Geist', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '0.5rem'
      }
    }
  },
  plugins: []
};
