import i18next from "i18next";
import { Menu, MenuItem, Platform, TFile, TFolder} from "obsidian";

import GithubPublisher from "../main";
import {MonoRepoProperties, RepoFrontmatter, Repository} from "../settings/interface";
import {getRepoFrontmatter} from "../utils";
import {defaultRepo, getRepoSharedKey, isShared, multipleSharedKey} from "../utils/data_validation_test";
import {shareAllMarkedNotes, shareOneNote} from "./commands";
import {ChooseRepoToRun} from "./suggest_other_repo_commands_modal";

/**
 * Share the shared file of a folder to a repository
 * @param {GithubPublisher} plugin - The plugin instance
 * @param {TFolder} folder - The folder to share
 * @param {string} branchName - The branch name for the repository
 * @param {Repository | null} repo - The data repository found in the file
 */
export async function shareFolderRepo(plugin: GithubPublisher, folder: TFolder, branchName: string, repo: Repository | null) {
	const publisher = await plugin.reloadOctokit();
	const statusBarItems = plugin.addStatusBarItem();
	const monoProperties: MonoRepoProperties = {
		frontmatter: getRepoFrontmatter(plugin.settings, repo, undefined) as RepoFrontmatter,
		repo,
	};
	await shareAllMarkedNotes(
		publisher,
		statusBarItems,
		branchName,
		monoProperties,
		publisher.getSharedFileOfFolder(folder, repo),
		true,
	);
}

/**
 * Create a submenu if multiple repository are set up
 * If Platform is Desktop, create a submenu
 * If not, add the command to the original menu, in line
 * @param {GithubPublisher} plugin - The plugin instance
 * @param {MenuItem} item - The item to add the submenu to
 * @param {TFolder} folder - The folder to share
 * @param {string} branchName - The branch name for the repository
 * @return {Menu} - The submenu created
 */
export function addSubMenuCommandsFolder(plugin: GithubPublisher, item: MenuItem, folder: TFolder, branchName: string, originalMenu: Menu): Menu {
	//@ts-ignore
	const subMenu = Platform.isDesktop ? item.setSubmenu() as Menu : originalMenu;
	subMenu.addItem((subItem) => {
		subItem
			.setTitle(i18next.t("commands.shareViewFiles.multiple.on", {
				smartKey: i18next.t("common.default").toUpperCase(),
				doc: folder.name
			}))
			.setIcon("folder-up")
			.onClick(async () => {
				const repo = getRepoSharedKey(plugin.settings, undefined);
				await shareFolderRepo(plugin, folder, branchName, repo);
			});
	});
	const activatedRepoCommands = plugin.settings.github.otherRepo.filter((repo) => repo.createShortcuts);
	if (activatedRepoCommands.length > 0) {
		activatedRepoCommands.forEach((otherRepo) => {
			subMenu.addItem((item) => {
				item.setTitle(
					i18next.t("commands.shareViewFiles.multiple.on", {
						smartKey: otherRepo.smartKey.toUpperCase(),
						doc: folder.name
					}))
					.setIcon("folder-up")
					.onClick(async () => {
						await shareFolderRepo(plugin, folder, branchName, otherRepo);
					});
			});
		});
	}
	subMenu.addItem((subItem) => {
		subItem
			.setTitle(i18next.t("commands.shareViewFiles.multiple.other"))
			.setIcon("folder-symlink")
			.onClick(async () => {
				new ChooseRepoToRun(plugin.app, plugin, null, branchName, "folder", null, async (item: Repository) => {
					await shareFolderRepo(plugin, folder, branchName, item);
				}).open();

			});
	});
	return subMenu;
}

/**
 * Create a menu for a shared file
 * @param {GithubPublisher} plugin - The plugin instance
 * @param {TFile} file - The file to share
 * @param {string} branchName - The branch name for the repository
 * @param {Menu} menu - The menu to add the item to
 */
export function addMenuFile(plugin: GithubPublisher, file: TFile, branchName: string, menu: Menu) {
	const frontmatter = file instanceof TFile ? plugin.app.metadataCache.getFileCache(file)!.frontmatter : undefined;
	let getSharedKey = getRepoSharedKey(plugin.settings, frontmatter);
	const allKeysFromFile = multipleSharedKey(frontmatter, plugin.settings);
	if (
		isShared(frontmatter, plugin.settings, file, getSharedKey) && 
		plugin.settings.plugin.fileMenu
	) {
		const repoFrontmatter = getRepoFrontmatter(plugin.settings, getSharedKey, frontmatter);
		menu.addItem((item) => {
			/**
			 * Create a submenu if multiple repo exists in the settings & platform is desktop
			 */

			if (allKeysFromFile.length > 1 || (repoFrontmatter instanceof Array && repoFrontmatter.length > 1)) {
				if (Platform.isDesktop) {
					item
						.setTitle("Github Publisher")
						.setIcon("upload-cloud");
				} else {
					//add the line to separate the commands
					menu.addSeparator();
					item.setIsLabel(true);
				}
				subMenuCommandsFile(
					plugin,
					item,
					file,
					branchName,
					getSharedKey,
					menu
				);
				return;
			}
			const fileName = plugin.getTitleFieldForCommand(file, plugin.app.metadataCache.getFileCache(file)?.frontmatter).replace(".md", "");
			
			if (!frontmatter || !frontmatter[plugin.settings.plugin.shareKey]) {
				const otherRepo = plugin.settings.github.otherRepo.find((repo) => repo.shareAll?.enable);
				if (otherRepo) getSharedKey = otherRepo;
				else if (plugin.settings.plugin.shareAll?.enable) getSharedKey = defaultRepo(plugin.settings);
			} else if (frontmatter[plugin.settings.plugin.shareKey]) {
				getSharedKey = defaultRepo(plugin.settings);
			}
			item
				.setTitle(i18next.t("commands.shareViewFiles.multiple.on", {
					doc: fileName,
					smartKey: getSharedKey?.smartKey.toUpperCase() || i18next.t("common.default").toUpperCase()
				}))
				.setIcon("file-up")
				.onClick(async () => {
					await shareOneNote(
						branchName,
						await plugin.reloadOctokit(),
						file,
						getSharedKey,
						fileName
					);
				});
		});
	}
}

/**
 * Create a subMenu if multiple repository are set up
 * If Platform is Desktop, create a submenu
 * If not, add the command to the original menu, in line
 * @param {GithubPublisher} plugin - The plugin instance
 * @param {MenuItem} item - The item to add the submenu to
 * @param {TFile} file - The file to share
 * @param {string} branchName - The branch name for the repository
 * @param {Repository} repo - The data repository found in the file
 * @return {Menu} - The submenu created
 */
export function subMenuCommandsFile(plugin: GithubPublisher, item: MenuItem, file: TFile, branchName: string, repo: Repository | null, originalMenu: Menu): Menu {
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const fileName = plugin.getTitleFieldForCommand(file, frontmatter).replace(".md", "");
	//@ts-ignore
	const subMenu = Platform.isDesktop ? item.setSubmenu() as Menu : originalMenu;
	let repoFrontmatter = getRepoFrontmatter(plugin.settings, repo, frontmatter);
	repoFrontmatter = repoFrontmatter instanceof Array ? repoFrontmatter : [repoFrontmatter];
	/**
	 * default repo
	 */
	if ((repo?.shareKey === plugin.settings.plugin.shareKey || (frontmatter?.[plugin.settings.plugin.shareKey])) && (!frontmatter?.repo || !frontmatter?.multipleRepo)) {
		subMenu.addItem((subItem) => {
			subItem
				.setTitle(
					(i18next.t("commands.shareViewFiles.multiple.on", {
						smartKey: i18next.t("common.default").toUpperCase(),
						doc: fileName,
					})))
				.setIcon("file-up")
				.onClick(async () => {
					await shareOneNote(
						branchName,
						await plugin.reloadOctokit(),
						file,
						defaultRepo(plugin.settings),
						fileName
					);
				});
		});
	}
	const activatedRepoCommands = plugin.settings.github.otherRepo.filter((repo) => repo.createShortcuts);

	if (activatedRepoCommands.length > 0) {
		activatedRepoCommands.forEach((otherRepo) => {
			if (otherRepo.shareKey === repo?.shareKey || (frontmatter?.[otherRepo.shareKey])) {
				subMenu.addItem((item) => {
					item
						.setTitle(i18next.t("commands.shareViewFiles.multiple.on", {
							smartKey: otherRepo.smartKey.toUpperCase(),
							doc: fileName
						}))
						.setIcon("file-up")
						.onClick(async () => {
							await shareOneNote(
								branchName,
								await plugin.reloadOctokit(),
								file,
								otherRepo,
								fileName
							);
						});
				});
			}
		});
	}
	if (repoFrontmatter.length > 1) {
		repoFrontmatter.forEach((repoFront) => {
			subMenu.addItem((item) => {
				item
					.setTitle(i18next.t("commands.shareViewFiles.multiple.on", {
						smartKey: repoFront.repo.toUpperCase(),
						doc: fileName
					}))
					.setIcon("file-up")
					.onClick(async () => {
						await shareOneNote(
							branchName,
							await plugin.reloadOctokit(),
							file,
							repo,
							fileName
						);
					});
			});
		});
	}

	subMenu.addItem((subItem) => {
		subItem
			.setTitle(i18next.t("commands.shareViewFiles.multiple.other"))
			.setIcon("file-input")
			.onClick(async () => {
				new ChooseRepoToRun(plugin.app, plugin, repo?.shareKey, branchName, "file", file.basename, async (item: Repository) => {
					await shareOneNote(
						branchName,
						await plugin.reloadOctokit(),
						file,
						item,
						fileName
					);
				}).open();
			});
	});
	return subMenu;
}

/**
 * Create a menu with submenu for a folder in the explorer view
 * @param menu {Menu} - The menu to add the item to
 * @param folder {TFolder} - The folder to share
 * @param branchName {string} - The branch name for the repository
 * @param plugin {GithubPublisher} - The plugin instance
 */
export async function addMenuFolder(menu: Menu, folder: TFolder, branchName: string, plugin: GithubPublisher) {
	menu.addItem((item) => {
		/**
		 * Create a submenu if multiple repo exists in the settings
		*/
		const areTheyMultipleRepo = plugin.settings.github?.otherRepo?.length > 0;
		if (areTheyMultipleRepo) {
			if (Platform.isDesktop) {
				item.setTitle("Github Publisher");
				item.setIcon("upload-cloud");
			} else {
				//add the line to separate the commands
				menu.addSeparator();
				item.setIsLabel(true);
			}
			addSubMenuCommandsFolder(
				plugin,
				item,
				folder,
				branchName,
				menu
			);
			return;
		}
		item.setSection("action");
		item.setTitle(
			i18next.t("commands.shareViewFiles.multiple.on", {
				smartKey: i18next.t("common.default").toUpperCase(),
				doc: folder.name
			}))
			.setIcon("folder-up")
			.onClick(async () => {
				const repo = getRepoSharedKey(plugin.settings, undefined);
				await shareFolderRepo(plugin, folder, branchName, repo);
			});
	});
}
