use std::process::Command;

fn main() {
    #[cfg(not(target_os = "windows"))]
    Command::new("./bin/buildjs.sh").output().expect("failed to build javascript");
}
