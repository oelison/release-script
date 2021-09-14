import { DefaultStages } from "@alcalzone/release-script-core";
import { assertReleaseError, createMockContext, TestFS } from "@alcalzone/release-script-testing";
import fs from "fs-extra";
import path from "path";
import PackagePlugin from ".";

describe("Package plugin", () => {
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

		it("raises a fatal error when package.json is missing from cwd", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /no package.json found/i,
			});
		});

		it("raises a fatal error when package.json contains no version field", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
				}),
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /missing property version/i,
			});
		});

		it("raises a fatal error when package.json contains a non-semver version", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "a.b.c",
				}),
			});

			await assertReleaseError(() => pkgPlugin.executeStage(context, DefaultStages.check), {
				fatal: true,
				messageMatches: /invalid version "a.b.c"/i,
			});
		});

		it(`"errors when package scripts are outdated`, async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			context.setData("lerna", true);

			await testFS.create({
				"package.json": JSON.stringify({
					name: "test-package",
					version: "1.2.3",
					scripts: {
						release: "lerna version",
						preversion: "release-script --lerna-check",
						version: "release-script --lerna",
						postversion: "git push && git push --tags",
					},
				}),
			});

			await pkgPlugin.executeStage(context, DefaultStages.check);
			expect(context.errors).toContainEqual(expect.stringMatching(`lerna version`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"preversion"`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"version"`));
			expect(context.errors).toContainEqual(expect.stringMatching(`"postversion"`));
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

		it("logs the version change", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			context.setData("package.json", {
				name: "test-package",
				version: "1.0.0",
			});
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating package.json version/i),
			);
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("1.0.0"));
			expect(context.cli.log).toHaveBeenCalledWith(expect.stringMatching("1.2.3"));
		});

		it("updates package.json", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});

			context.setData("package.json", {
				name: "test-package",
				version: "1.0.0",
			});
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const packPath = path.join(testFSRoot, "package.json");
			const fileContent = (await fs.readFile(packPath, "utf8")).trim();
			expect(fileContent).toBe(`{
  "name": "test-package",
  "version": "1.2.3"
}`);
		});

		it("but not in lerna mode", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
			});
			const packPath = path.join(testFSRoot, "package.json");
			const pack = {
				name: "test-package",
				version: "1.0.0",
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
			});

			context.setData("package.json", pack);
			context.setData("version_new", "1.2.3");
			context.setData("lerna", true);

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = await fs.readJson(packPath);
			expect(fileContent).toEqual(pack);
		});

		it("and not during a dry run", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					dryRun: true,
				},
			});
			const packPath = path.join(testFSRoot, "package.json");
			const pack = {
				name: "test-package",
				version: "1.0.0",
			};
			await testFS.create({
				"package.json": JSON.stringify(pack, null, 2),
			});

			context.setData("package.json", pack);
			context.setData("version_new", "1.2.3");

			await pkgPlugin.executeStage(context, DefaultStages.edit);

			const fileContent = await fs.readJson(packPath);
			expect(fileContent).toEqual(pack);
		});
	});

	describe("commit stage", () => {
		let testFS: TestFS;
		let testFSRoot: string;
		beforeEach(async () => {
			testFS = new TestFS();
			testFSRoot = await testFS.getRoot();
		});
		afterEach(async () => {
			await testFS.remove();
		});

		it("executes npm install if the lockfile should be synchronized", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					updateLockfile: true,
				},
			});

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await pkgPlugin.executeStage(context, DefaultStages.commit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating lockfile/i),
			);
			expect(context.sys.execRaw).toHaveBeenCalledWith("npm install", expect.anything());
		});

		it("but not during a dry run", async () => {
			const pkgPlugin = new PackagePlugin();
			const context = createMockContext({
				plugins: [pkgPlugin],
				cwd: testFSRoot,
				argv: {
					updateLockfile: true,
					dryRun: true,
				},
			});

			// Don't throw when calling system commands
			context.sys.mockExec(() => "");

			await pkgPlugin.executeStage(context, DefaultStages.commit);

			expect(context.cli.log).toHaveBeenCalledWith(
				expect.stringMatching(/updating lockfile/i),
			);
			expect(context.sys.execRaw).not.toHaveBeenCalled();
		});
	});
});
