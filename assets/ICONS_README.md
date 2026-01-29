# App Icons

This folder should contain app icons in the following formats:

## Required Files

| File | Platform | Requirements |
|------|----------|--------------|
| `icon.ico` | Windows | 256x256 minimum, multi-resolution recommended |
| `icon.icns` | macOS | Multi-resolution Apple icon format |
| `icon.png` | Linux | 512x512 PNG |

## Creating Icons

### Option 1: Online Converters
1. Start with a 1024x1024 PNG source image
2. Use https://icoconvert.com/ to create `icon.ico`
3. Use https://cloudconvert.com/png-to-icns to create `icon.icns`
4. Resize PNG to 512x512 for Linux

### Option 2: Use the included SVG
Convert `icon.svg` using online tools or ImageMagick:
```bash
# PNG (requires ImageMagick or similar)
convert icon.svg -resize 512x512 icon.png

# ICO (use online converter)
# ICNS (use online converter or iconutil on macOS)
```

## Note
Icon paths have been removed from package.json so builds will use default Electron icons.
Once you create the icon files, add these lines back to package.json under the "build" section:

```json
"win": {
  "icon": "assets/icon.ico"
},
"mac": {
  "icon": "assets/icon.icns"
},
"linux": {
  "icon": "assets/icon.png"
}
```
