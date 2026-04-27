const { withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withBtPrinterFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("allowInsecureProtocol")) {
      config.modResults.contents += `
subprojects {
    afterEvaluate { project ->
        project.repositories.all { repo ->
            if (repo.hasProperty('url')) {
                def repoUrl = repo.url?.toString() ?: ''
                if (repoUrl.startsWith('http://')) {
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
