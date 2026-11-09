/**
 * Patches react-native-sensors for compatibility with Gradle 8+ / 9+
 * Removes deprecated jcenter() and ancient classpath declaration.
 */
const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '../node_modules/react-native-sensors/android/build.gradle',
);

if (fs.existsSync(targetPath)) {
  let content = fs.readFileSync(targetPath, 'utf8');
  if (content.includes('jcenter()')) {
    content = content.replace(/jcenter\(\)/g, '// jcenter()');
    content = content.replace(
      /classpath\("com\.android\.tools\.build:gradle:3\.5\.1"\)/g,
      '// classpath removed for modern gradle',
    );
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log('Successfully patched react-native-sensors build.gradle');
  }
}
