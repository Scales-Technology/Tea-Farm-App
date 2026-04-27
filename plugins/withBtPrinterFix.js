const { withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withBtPrinterFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("allowInsecureProtocol")) {
      config.modResults.contents += `
allprojects {
    repositories {
        all { repo ->
            if (repo instanceof MavenArtifactRepository) {
                if (repo.url.scheme == 'http') {
                    repo.allowInsecureProtocol = true
                }
            }
        }
    }
}
`;
    }
    return config;
  });
};
