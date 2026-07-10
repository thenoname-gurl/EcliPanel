use base64::Engine;
use clap::{Args, FromArgMatches};
use colored::Colorize;
use dialoguer::{Confirm, Input, theme::ColorfulTheme};

#[derive(Args)]
pub struct ConfigureArgs {
    #[arg(
        long = "allow-insecure",
        help = "allow insecure connections to the panel (e.g., invalid TLS certs)"
    )]
    pub allow_insecure: bool,

    #[arg(
        short = 'o',
        long = "override",
        help = "override the current configuration if it exists"
    )]
    pub r#override: bool,

    #[arg(long = "panel-url", help = "the url of the panel")]
    pub panel_url: Option<String>,

    #[arg(long = "join-data", help = "base64 encoded join data from the panel")]
    pub join_data: Option<String>,

    #[arg(long = "token", help = "the token to authenticate with the panel")]
    pub token: Option<String>,

    #[arg(long = "node", help = "the node id to configure")]
    pub node: Option<usize>,

    #[arg(
        short = 'c',
        long = "config",
        help = "path to the config file",
        default_value = crate::DEFAULT_CONFIG_PATH
    )]
    pub config: String,
}

pub struct ConfigureCommand;

impl crate::commands::CliCommand<ConfigureArgs> for ConfigureCommand {
    fn get_command(&self, command: clap::Command) -> clap::Command {
        command
    }

    fn get_executor(self) -> Box<crate::commands::ExecutorFunc> {
        Box::new(|env, arg_matches| {
            Box::pin(async move {
                let args = ConfigureArgs::from_arg_matches(&arg_matches)?;

                if env.is_some() && !args.r#override {
                    let confirm = Confirm::with_theme(&ColorfulTheme::default())
                        .with_prompt("do you want to override the current configuration?")
                        .default(false)
                        .interact()?;

                    if !confirm {
                        return Ok(1);
                    }
                }

                if let Some(join_data) = args.join_data {
                    let decoding_engine = base64::engine::general_purpose::GeneralPurpose::new(
                        &base64::alphabet::STANDARD,
                        Default::default(),
                    );

                    let decoded = match decoding_engine.decode(&join_data) {
                        Ok(decoded) => decoded,
                        Err(_) => {
                            eprintln!("{}", "failed to decode join data!".red());
                            return Ok(1);
                        }
                    };

                    let response = match serde_norway::from_slice(&decoded) {
                        Ok(response) => response,
                        Err(_) => {
                            eprintln!("{}", "failed to decode join data payload!".red());
                            return Ok(1);
                        }
                    };

                    crate::config::Config::save_new(&args.config, response)?;

                    println!("{}", "successfully configured wings.".green());

                    Ok(0)
                } else {
                    let panel_url = match args.panel_url {
                        Some(url) => url,
                        None => Input::with_theme(&ColorfulTheme::default())
                            .with_prompt("panel url")
                            .interact_text()?,
                    };

                    let panel_url = match reqwest::Url::parse(&panel_url) {
                        Ok(url) => url,
                        Err(_) => {
                            eprintln!("{}", "invalid url".red());
                            return Ok(1);
                        }
                    };

                    let token = match args.token {
                        Some(token) => token,
                        None => Input::with_theme(&ColorfulTheme::default())
                            .with_prompt("token")
                            .interact_text()?,
                    };

                    let node = match args.node {
                        Some(node) => node,
                        None => {
                            let node: usize = Input::with_theme(&ColorfulTheme::default())
                                .with_prompt("node id")
                                .interact_text()?;

                            if node == 0 {
                                eprintln!("{}", "node id cannot be 0".red());
                                return Ok(1);
                            }

                            node
                        }
                    };

                    let client = reqwest::Client::builder()
                        .tls_danger_accept_invalid_certs(args.allow_insecure)
                        .build()?;

                    let response = client
                        .get(format!(
                            "{}/api/application/nodes/{}/configuration",
                            panel_url.to_string().trim_end_matches('/'),
                            node
                        ))
                        .header("Authorization", format!("Bearer {token}"))
                        .header("Accept", "application/vnd.pterodactyl.v1+json")
                        .send()
                        .await;

                    let response = match response {
                        Ok(res) => match res.text().await {
                            Ok(text) => crate::remote::into_json(text),
                            Err(err) => {
                                eprintln!("{} {:#?}", "failed to read response body:".red(), err);
                                return Ok(1);
                            }
                        },
                        Err(err) => {
                            eprintln!("{} {:#?}", "failed to connect to panel:".red(), err);
                            return Ok(1);
                        }
                    };

                    let response = match response {
                        Ok(response) => response,
                        Err(err) => {
                            eprintln!("{} {:#?}", "failed to get configuration:".red(), err);
                            return Ok(1);
                        }
                    };

                    crate::config::Config::save_new(&args.config, response)?;

                    println!("{}", "successfully configured wings.".green());

                    Ok(0)
                }
            })
        })
    }
}
