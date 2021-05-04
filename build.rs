use std::process::Command;

fn main() {
    Command::new("bash")
        .args(&["./bin/buildjs.sh"])
        .output()
        .expect("failed to build javascript");
}
