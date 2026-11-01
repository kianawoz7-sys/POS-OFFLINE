param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$Architectures = 'arm64-v8a,armeabi-v7a',
    [string]$ApkName = 'POS-Offline-Fase1.apk',
    [switch]$BuildDetails
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $JavaHome) {
    $studioEntry = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Android Studio' -ErrorAction SilentlyContinue
    if ($studioEntry -and $studioEntry.DisplayIcon) {
        $studioExe = ($studioEntry.DisplayIcon -replace ',\d+$', '').Trim('"')
        $studioRoot = Split-Path -Parent (Split-Path -Parent $studioExe)
        $JavaHome = Join-Path $studioRoot 'jbr'
    }
}
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) {
    throw 'Java belum ditemukan. Gunakan -JavaHome dengan folder JDK/JBR Android Studio.'
}
if (-not $SdkPath) { $SdkPath = $env:ANDROID_SDK_ROOT }
if (-not $SdkPath) { $SdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath $SdkPath)) {
    throw 'Android SDK belum ditemukan. Gunakan -SdkPath dengan folder Android SDK.'
}
if ($Architectures -notmatch '^(arm64-v8a|armeabi-v7a|x86|x86_64)(,(arm64-v8a|armeabi-v7a|x86|x86_64))*$') {
    throw 'Daftar arsitektur Android tidak valid.'
}
if ($ApkName -notmatch '^[A-Za-z0-9_-]+\.apk$') { throw 'Nama APK harus berupa nama file .apk tanpa folder.' }

$originalJavaHome = $env:JAVA_HOME
$originalAndroidHome = $env:ANDROID_HOME
$originalAndroidSdkRoot = $env:ANDROID_SDK_ROOT
$originalPath = $env:PATH
$originalNodeEnv = $env:NODE_ENV

Push-Location $projectRoot
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $SdkPath
    $env:ANDROID_SDK_ROOT = $SdkPath
    $env:PATH = "$JavaHome\bin;$originalPath"
    $env:NODE_ENV = 'production'

    if (-not (Test-Path -LiteralPath 'node_modules\expo\package.json')) {
        throw 'Dependencies belum terpasang. Jalankan npm ci terlebih dahulu.'
    }
    & npx.cmd expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild gagal.' }

    $wrapperProperties = Join-Path $projectRoot 'android\gradle\wrapper\gradle-wrapper.properties'
    $wrapperText = [IO.File]::ReadAllText($wrapperProperties)
    $wrapperText = $wrapperText -replace 'networkTimeout=\d+', 'networkTimeout=60000'
    [IO.File]::WriteAllText($wrapperProperties, $wrapperText)

    # An already verified local distribution avoids a second wrapper download.
    $cachedGradle = Join-Path $projectRoot '.expo\build-tools\gradle-8.14.3\bin\gradle.bat'
    $cachedZip = Join-Path $projectRoot '.expo\build-tools\gradle-8.14.3-bin.zip'
    $gradleCommand = Join-Path $projectRoot 'android\gradlew.bat'
    if ((Test-Path -LiteralPath $cachedGradle) -and (Test-Path -LiteralPath $cachedZip)) {
        $checksum = (Get-FileHash -LiteralPath $cachedZip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($checksum -eq 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531') {
            $gradleCommand = $cachedGradle
        }
    }

    Set-Location (Join-Path $projectRoot 'android')
    $gradleArguments = @(':app:assembleRelease', '--no-daemon', '--max-workers=2', "-PreactNativeArchitectures=$Architectures", '-Djava.net.preferIPv4Stack=true', '--console=plain')
    if ($BuildDetails) { $gradleArguments += '--info' }
    $logDirectory = Join-Path $projectRoot '.expo'
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    & $gradleCommand @gradleArguments | Tee-Object -FilePath (Join-Path $logDirectory 'android-build.log')
    if ($LASTEXITCODE -ne 0) { throw 'Build APK gagal. Periksa error Gradle di atas.' }

    $builtApk = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path -LiteralPath $builtApk)) { throw 'Output APK tidak ditemukan.' }
    $artifactDirectory = Join-Path $projectRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
    $artifactApk = Join-Path $artifactDirectory $ApkName
    Copy-Item -LiteralPath $builtApk -Destination $artifactApk -Force
    $apkHash = (Get-FileHash -LiteralPath $artifactApk -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $artifactDirectory "$ApkName.sha256"), "$apkHash  $ApkName`n")
    Write-Output "APK: $artifactApk"
    Write-Output "SHA256: $apkHash"
}
finally {
    Pop-Location
    $env:JAVA_HOME = $originalJavaHome
    $env:ANDROID_HOME = $originalAndroidHome
    $env:ANDROID_SDK_ROOT = $originalAndroidSdkRoot
    $env:PATH = $originalPath
    $env:NODE_ENV = $originalNodeEnv
}
