use std::process::Command;

fn main() {
    Command::new("./bin/buildjs.sh").output().expect("failed to build javascript");
}
