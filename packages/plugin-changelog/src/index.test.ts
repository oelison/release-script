import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "fs-extra";
import path from "path";
import ChangelogPlugin from ".";

const fixtures = {
	readme_noPlaceholder: `# README
stuff
## Changelog
### 1.2.3 Other release`,
	changelog_tooManyPlaceholders: `# Changelog
## **WORK IN PROGRESS** · Doomsday release
## **WORK IN PROGRESS** · Whoopsie
## 1.2.3 Other release`,
	changelog_empty: `# Changelog
## **WORK IN PROGRESS** · Doomsday release

## 1.2.3 Other release`,

	changelog_testParseHeader: `# Changelog`,
	changelog_testParse1: `## **WORK IN PROGRESS** · Doomsday release
* New entry 1
* New entry 2`,
	changelog_testParse2: `## 1.2.3 Other release
* Did something`,
	changelog_testParse3: `## 1.2.0 Other release
* Did something else`,
	changelog_testReplaced: `## 2.3.4 (${new Date().toISOString().split("T")[0]}) · Doomsday release
* New entry 1
* New entry 2`,

	readme_testParseHeader: `# README
stuff
## Changelog`,
	readme_testParse1: `### **WORK IN PROGRESS** · Doomsday release
* New entry 1
* New entry 2`,
	readme_testParse2: `### 1.2.3 Other release
* Did something`,
	readme_testParse3: `### 1.2.0 Other release
* Did something else`,
	readme_testReplaced: `### 2.3.4 (${new Date().toISOString().split("T")[0]}) · Doomsday release
* New entry 1
* New entry 2`,

	changelog_old_testParseHeader: `# Changelog (older changes)`,
	changelog_old_testParse1: `## 1.0.0 Old release
* Did something`,
	changelog_old_testParse2: `## 0.0.1 Older release
* Did something else`,
	changelog_old_testParseFooter: `# Unrelated stuff`,
};

describe("Changelog plugin", () => {
	describe("check stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("raises a fatal error when there is no README.md or CHANGELOG.md in the current directory", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(
				() => changelogPlugin.executeStage(context, DefaultStages.check),
				{
					fatal: true,
					messageMatches: /No CHANGELOG.md or README.md/i,
				},
			);
		});

		it("raises an error when there is no changelog placeholder in the changelog", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"README.md": fixtures.readme_noPlaceholder,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/placeholder is missing/i));
		});

		it("raises an error when there is more than one placeholder in the changelog", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": fixtures.changelog_tooManyPlaceholders,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(
				expect.stringMatching(/more than one changelog placeholder/i),
			);
		});

		it("raises an error when the current changelog is empty", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": fixtures.changelog_empty,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(/changelog .+ is empty/i));
		});

		it("parses all changelog entries", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"CHANGELOG.md": `${fixtures.changelog_testParseHeader}
${fixtures.changelog_testParse1}

${fixtures.changelog_testParse2}

${fixtures.changelog_testParse3}`,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			const headline = context.getData<string[]>("changelog_before");
			expect(headline).toBe(fixtures.changelog_testParseHeader + "\n");

			const entries = context.getData<string[]>("changelog_entries");
			expect(entries).toEqual([
				fixtures.changelog_testParse1,
				fixtures.changelog_testParse2,
				fixtures.changelog_testParse3,
			]);

			const footer = context.getData<string[]>("changelog_after");
			expect(footer).toBe("");

			const currentChangelog = context.getData<string[]>("changelog_new");
			expect(currentChangelog).toBe(`* New entry 1
* New entry 2`);
		});

		it("even if they are split across multiple files", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"README.md": `${fixtures.readme_testParseHeader}
${fixtures.readme_testParse1}

${fixtures.readme_testParse2}

${fixtures.readme_testParse3}`,
				"CHANGELOG_OLD.md": `${fixtures.changelog_old_testParseHeader}
${fixtures.changelog_old_testParse1}

${fixtures.changelog_old_testParse2}

${fixtures.changelog_old_testParseFooter}`,
			});

			await changelogPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toHaveLength(0);

			const filename = context.getData<string[]>("changelog_filename");
			expect(filename).toBe("README.md");

			const headline = context.getData<string[]>("changelog_before");
			expect(headline).toBe(fixtures.readme_testParseHeader + "\n");

			const entries = context.getData<string[]>("changelog_entries");
			expect(entries).toEqual([
				fixtures.readme_testParse1,
				fixtures.readme_testParse2,
				fixtures.readme_testParse3,
				fixtures.changelog_old_testParse1,
				fixtures.changelog_old_testParse2,
			]);

			const footer = context.getData<string[]>("changelog_after");
			expect(footer).toBe("");

			const headlineOld = context.getData<string[]>("changelog_old_before");
			expect(headlineOld).toBe(fixtures.changelog_old_testParseHeader + "\n");
			const footer_old = context.getData<string[]>("changelog_old_after");
			expect(footer_old).toBe(fixtures.changelog_old_testParseFooter);

			const currentChangelog = context.getData<string[]>("changelog_new");
			expect(currentChangelog).toBe(`* New entry 1
* New entry 2`);
		});
	});

	describe("edit stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("updates README.md correctly", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			context.setData("changelog_filename", "README.md");
			context.setData("changelog_location", "readme");
			context.setData("changelog_before", fixtures.readme_testParseHeader);
			context.setData("changelog_entries", [
				fixtures.readme_testParse1,
				fixtures.readme_testParse2,
				fixtures.readme_testParse3,
			]);
			context.setData("changelog_after", "");
			context.setData("changelog_entry_prefix", "###");
			context.setData("version_new", "2.3.4");

			await changelogPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = await fs.readFile(path.join(testFSRoot, "README.md"), "utf8");

			expect(fileContent).toBe(`${fixtures.readme_testParseHeader}
${fixtures.readme_testReplaced}

${fixtures.readme_testParse2}

${fixtures.readme_testParse3}`);
		});

		it("updates CHANGELOG.md correctly", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			context.setData("changelog_filename", "CHANGELOG.md");
			context.setData("changelog_location", "changelog");
			context.setData("changelog_before", fixtures.changelog_testParseHeader);
			context.setData("changelog_entries", [
				fixtures.changelog_testParse1,
				fixtures.changelog_testParse2,
				fixtures.changelog_testParse3,
			]);
			context.setData("changelog_after", "");
			context.setData("changelog_entry_prefix", "##");
			context.setData("version_new", "2.3.4");

			await changelogPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = await fs.readFile(path.join(testFSRoot, "CHANGELOG.md"), "utf8");

			expect(fileContent).toBe(`${fixtures.changelog_testParseHeader}
${fixtures.changelog_testReplaced}

${fixtures.changelog_testParse2}

${fixtures.changelog_testParse3}`);
		});

		it("updates README.md & CHANGELOG_OLD.md correctly", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
				argv: {
					numChangelogEntries: 2,
				},
			});

			context.setData("changelog_filename", "README.md");
			context.setData("changelog_location", "readme");
			context.setData("changelog_before", fixtures.readme_testParseHeader);
			context.setData("changelog_entries", [
				fixtures.readme_testParse1,
				fixtures.readme_testParse2,
				fixtures.readme_testParse3,
				fixtures.changelog_old_testParse1,
				fixtures.changelog_old_testParse2,
			]);
			context.setData("changelog_after", "");
			context.setData("changelog_old_before", fixtures.changelog_old_testParseHeader);
			context.setData("changelog_old_after", "");
			context.setData("changelog_entry_prefix", "###");
			context.setData("version_new", "2.3.4");

			await changelogPlugin.executeStage(context, DefaultStages.edit);

			const readmeContent = await fs.readFile(path.join(testFSRoot, "README.md"), "utf8");
			const oldContent = await fs.readFile(path.join(testFSRoot, "CHANGELOG_OLD.md"), "utf8");

			expect(readmeContent).toBe(`${fixtures.readme_testParseHeader}
${fixtures.readme_testReplaced}

${fixtures.readme_testParse2}`);

			expect(oldContent).toBe(`${fixtures.changelog_old_testParseHeader}
${fixtures.readme_testParse3.slice(1)}

${fixtures.changelog_old_testParse1}

${fixtures.changelog_old_testParse2}`);
		});

		it("removes unnecessary blank linkes from the changelog", async () => {
			const changelogPlugin = new ChangelogPlugin();
			const context = createMockContext({
				plugins: [changelogPlugin],
				cwd: testFSRoot,
			});

			context.setData("changelog_filename", "CHANGELOG.md");
			context.setData("changelog_location", "changelog");
			context.setData("changelog_before", fixtures.changelog_testParseHeader + "\n\n\n");
			context.setData("changelog_entries", [
				fixtures.changelog_testParse1,
				fixtures.changelog_testParse2,
				fixtures.changelog_testParse3,
			]);
			context.setData("changelog_after", "\n\n\n" + fixtures.changelog_old_testParseFooter);
			context.setData("changelog_entry_prefix", "##");
			context.setData("version_new", "2.3.4");

			await changelogPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = await fs.readFile(path.join(testFSRoot, "CHANGELOG.md"), "utf8");

			expect(fileContent).toBe(`${fixtures.changelog_testParseHeader}
${fixtures.changelog_testReplaced}

${fixtures.changelog_testParse2}

${fixtures.changelog_testParse3}

${fixtures.changelog_old_testParseFooter}`);
		});
	});
});