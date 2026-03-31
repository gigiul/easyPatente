---
name: css-best-practises
description: Styling guidelines and common CSS patterns for the easyPatente project to maintain visual consistency.
---

# Styling Guidelines - easyPatente

This document defines the core styling principles and common patterns used in the easyPatente project. All components and screens must adhere to these guidelines to ensure a consistent, professional, and "premium" experience.

## 1. Theming (Dark/Light Mode)

Project-wide theme support is mandatory.

- **NEVER** use hardcoded hex values for `backgroundColor` or text color on main containers/titles.
- **ALWAYS** use `ThemedView` and `ThemedText` components.
- For custom colors (like description texts or nested cards), use the `useThemeColor` hook:
  ```tsx
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  ```
- **ThemedView Props**: For cards that need a specific shade (other than the default background), use the `lightColor` and `darkColor` props:
  ```tsx
  <ThemedView lightColor="#F3F4F6" darkColor="#1F2937">...</ThemedView>
  ```

## 2. Layout & Spacing

### Page Structure
- **Container**: Use `<ThemedView style={styles.container}>` where `container` has `flex: 1`.
- **Top Header**: Use the `type="title"` on the first `ThemedText`. 
  - Standard spacing: `marginTop: 60`, `marginBottom: 8`, `paddingHorizontal: 16`.
- **Subtitle**: `marginBottom: 24`, `opacity: 0.7`, `paddingHorizontal: 16`.
- **Content**: Use `<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>`. Standard `padding` is `16` or `20`.

### Sectioning
- **Section Titles**: Use `defaultSemiBold` with `textTransform: 'uppercase'`, `letterSpacing: 1`, `fontSize: 14`, and `marginBottom: 12`.
- **Separators**: Use `<ThemedView style={styles.divider} lightColor="#E5E7EB" darkColor="#374151" />` where `divider` is `height: 1`.

## 3. Component Styling

### Cards
- **Radius**: Use `12px` for small grid items and `16px` for large containers/info cards.
- **Shadows**: Only apply to main feature cards.
  ```tsx
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 5,
  ```
- **Borders**: For secondary cards, use `borderWidth: 1` with a themed color.

### Interactive Elements (Buttons/Pressables)
- **Feedback**: Every interactive element should provide feedback:
  ```tsx
  style={({ pressed }) => [
    styles.button,
    pressed && { transform: [{ scale: 0.98 }], opacity: 0.8 }
  ]}
  ```
- **Height**: Standard primary button padding is `16px` or `18px` vertically.

## 4. Semantic Color Usage

Use specific colors for functional purposes:
- **Primary Action (Blue)**: `#2563EB`
- **Success/Pass (Green)**: `#059669`
- **Warning/Review (Amber)**: `#D97706`
- **Danger (Red)**: `#EF4444`

## 5. Typography

Always use `ThemedText` with appropriate `type` props:
- `title`: Large screen headings.
- `defaultSemiBold`: For labels, row headers, and important bits.
- `link`: For actionable text (e.g. "Delete Account").
- Do **NOT** override `fontFamily` unless explicitly requested.
