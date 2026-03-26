use serde::Deserialize;
use std::{fs::File, io::Write, path::Path, process::Command};

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=FUSEQUOTA_RELEASE");

    let target_arch =
        std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| "unknown".to_string());
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| "unknown".to_string());
    let target_env =
        std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_else(|_| "unknown".to_string());
    let release_env = std::env::var("FUSEQUOTA_RELEASE").unwrap_or_default();

    println!("cargo:rustc-env=CARGO_TARGET={target_arch}-{target_env}");

    handle_git_info();

    let bin_dir = Path::new("bins");
    if !bin_dir.exists() {
        std::fs::create_dir_all(bin_dir).ok();
    }

    let bin_path = bin_dir.join("fusequota");
    let version_path = bin_dir.join("fusequota.version");

    let existing_version = std::fs::read_to_string(&version_path)
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let mut final_version = existing_version.clone();

    let should_check_github = if release_env.starts_with("latest") {
        true
    } else if release_env.is_empty() && bin_path.exists() {
        false
    } else {
        !bin_path.exists() || (!release_env.is_empty() && release_env != existing_version)
    };

    if should_check_github
        && target_os == "linux"
        && let Some((tag, url)) = fetch_release_metadata(&target_arch)
        && (tag != existing_version || release_env.starts_with("latest"))
        && let Ok(resp) = reqwest::blocking::get(url)
        && resp.status().is_success()
    {
        let data = resp.bytes().expect("Failed to read response bytes");

        let compressed_data =
            zstd::encode_all(&*data, 22).expect("Failed to compress binary with zstd");

        let mut file = File::create(&bin_path).expect("Failed to create bin");
        file.write_all(&compressed_data)
            .expect("Failed to write compressed bin");

        std::fs::write(&version_path, &tag).ok();
        final_version = tag;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin_path, std::fs::Permissions::from_mode(0o755)).ok();
        }
    }

    if !bin_path.exists() {
        File::create(&bin_path).ok();
    }

    println!("cargo:rustc-env=FUSEQUOTA_VERSION={final_version}");

    handle_seccomp();
}

fn fetch_release_metadata(arch: &str) -> Option<(String, String)> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("rust-build-script")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let url = "https://api.github.com/repos/calagopus/fusequota/releases/latest";
    let release: GithubRelease = client.get(url).send().ok()?.json().ok()?;

    let expected_name = format!("fusequota-{arch}-linux");
    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name == expected_name)?;

    Some((release.tag_name, asset.browser_download_url))
}

fn handle_git_info() {
    let is_git_repo = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    let mut git_hash = "unknown".to_string();

    if is_git_repo {
        println!("cargo:rerun-if-changed=../.git/HEAD");

        if let Ok(head) = std::fs::read_to_string("../.git/HEAD")
            && head.starts_with("ref: ")
        {
            let head_ref = head.trim_start_matches("ref: ").trim();
            println!("cargo:rerun-if-changed=../.git/{head_ref}");
            println!(
                "cargo:rustc-env=CARGO_GIT_BRANCH={}",
                head_ref.rsplit('/').next().unwrap_or("unknown")
            );
        } else {
            println!("cargo:rustc-env=CARGO_GIT_BRANCH=unknown");
        }
        println!("cargo:rerun-if-changed=../.git/index");

        if let Ok(output) = Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            && output.status.success()
        {
            git_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
    }
    println!("cargo:rustc-env=CARGO_GIT_COMMIT={git_hash}");
}

fn handle_seccomp() {
    println!("cargo:rerun-if-changed=seccomp.json");
    let seccomp_path = Path::new("seccomp.json");
    if seccomp_path.exists() {
        let seccomp = std::fs::read_to_string(seccomp_path).expect("Failed to read seccomp.json");
        let val: serde_json::Value =
            serde_json::from_str(&seccomp).expect("Failed to parse seccomp.json");
        let seccomp_min = serde_json::to_string(&val).expect("Failed to serialize");
        std::fs::write("seccomp.min.json", seccomp_min).expect("Failed to write seccomp.min.json");
    }
}
