const fs = require('node:fs/promises');
const path = require('node:path');
const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidToolchain(config) {
  config = withProjectBuildGradle(config, async (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Plugin toolchain Android membutuhkan build.gradle Groovy.');
    }
    const reactNativePackage = require.resolve('react-native/package.json', {
      paths: [modConfig.modRequest.projectRoot],
    });
    const catalog = await fs.readFile(path.join(path.dirname(reactNativePackage), 'gradle', 'libs.versions.toml'), 'utf8');
    const agpVersion = catalog.match(/^agp\s*=\s*"([0-9.]+)"/m)?.[1];
    if (!agpVersion) {
      throw new Error('Versi Android Gradle Plugin tidak ditemukan di katalog React Native.');
    }
    const block = `
// POS Offline Android toolchain begin
subprojects {
  buildscript.configurations.configureEach {
    resolutionStrategy.force("com.android.tools.build:gradle:${agpVersion}")
  }
}
// POS Offline Android toolchain end
`;
    modConfig.modResults.contents = modConfig.modResults.contents.replace(/\n\/\/ POS Offline Android toolchain begin[\s\S]*?\/\/ POS Offline Android toolchain end\n?/g, '') + block;
    return modConfig;
  });
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Plugin toolchain Android membutuhkan app/build.gradle Groovy.');
    }
    const block = `
// POS Offline native path length begin
android {
  externalNativeBuild {
    cmake {
      // Avoid the generated object-path failure seen with SDK CMake 3.22.1 on Windows.
      version "3.30.5"
    }
  }
}
// POS Offline native path length end
`;
    modConfig.modResults.contents = modConfig.modResults.contents.replace(/\n\/\/ POS Offline native path length begin[\s\S]*?\/\/ POS Offline native path length end\n?/g, '') + block;
    return modConfig;
  });
};
