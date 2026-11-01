const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const printerGradle = `// POS Offline: build the legacy printer with the application's Android toolchain.
apply plugin: 'com.android.library'

android {
    namespace "cn.jystudio.bluetooth"
    compileSdkVersion rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    lint {
        abortOnError false
    }
    sourceSets {
        main {
            aidl.srcDirs = ['src/main/java']
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    // React Native's root Gradle plugin supplies the installed React Native version.
    implementation 'com.facebook.react:react-android'
    implementation "androidx.appcompat:appcompat:1.4.2"
    implementation "androidx.core:core:1.10.1"
    implementation "com.google.zxing:core:3.3.0"
}
`;

module.exports = function withPrinterAndroid(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const packagePath = require.resolve('@vardrz/react-native-bluetooth-escpos-printer/package.json', {
      paths: [modConfig.modRequest.projectRoot],
    });
    const installedPackage = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    if (installedPackage.version !== '0.1.2') {
      throw new Error('Konfigurasi printer Android perlu ditinjau untuk versi library selain 0.1.2.');
    }
    await fs.writeFile(path.join(path.dirname(packagePath), 'android', 'build.gradle'), printerGradle);
    return modConfig;
  }]);
};
