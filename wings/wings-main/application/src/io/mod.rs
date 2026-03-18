use std::{
    io::{Read, Write},
    os::fd::AsFd,
};

pub mod abort;
pub mod compression;
pub mod counting_reader;
pub mod counting_writer;
pub mod fixed_reader;
pub mod hash_reader;
pub mod limited_reader;
pub mod limited_writer;
pub mod range_reader;
pub mod tail;

pub fn copy(
    reader: &mut (impl ?Sized + Read),
    writer: &mut (impl ?Sized + Write),
) -> std::io::Result<()> {
    let mut buffer = vec![0; crate::BUFFER_SIZE];

    copy_shared(&mut buffer, reader, writer)
}

pub fn copy_shared(
    buffer: &mut [u8],
    reader: &mut (impl ?Sized + Read),
    writer: &mut (impl ?Sized + Write),
) -> std::io::Result<()> {
    loop {
        let bytes_read = reader.read(buffer)?;

        if crate::unlikely(bytes_read == 0) {
            break;
        }

        writer.write_all(&buffer[..bytes_read])?;
    }

    Ok(())
}

pub fn copy_file_progress(
    reader: &mut (impl AsFd + Read + ?Sized),
    writer: &mut (impl AsFd + Write + ?Sized),
    mut progress: impl FnMut(usize) -> Result<(), std::io::Error>,
    listener: abort::AbortListener,
) -> Result<u64, std::io::Error> {
    let mut total_copied = 0;

    loop {
        if crate::unlikely(listener.is_aborted()) {
            return Err(std::io::Error::other("Operation aborted"));
        }

        #[cfg(target_os = "linux")]
        let result = rustix::fs::copy_file_range(
            reader.as_fd(),
            None,
            writer.as_fd(),
            None,
            crate::BUFFER_SIZE,
        );
        #[cfg(not(target_os = "linux"))]
        let result = Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "copy_file_range is not supported on this platform",
        ));

        match result {
            Ok(0) => break,
            Ok(bytes_copied) => {
                total_copied += bytes_copied as u64;
                progress(bytes_copied)?;
            }
            Err(err) => match err.kind() {
                std::io::ErrorKind::Interrupted => continue,
                std::io::ErrorKind::CrossesDevices | std::io::ErrorKind::Unsupported => {
                    let mut buffer = vec![0; crate::BUFFER_SIZE];

                    loop {
                        if crate::unlikely(listener.is_aborted()) {
                            return Err(std::io::Error::other("Operation aborted"));
                        }

                        let bytes_read = reader.read(&mut buffer)?;
                        if crate::unlikely(bytes_read == 0) {
                            break;
                        }

                        writer.write_all(&buffer[..bytes_read])?;

                        total_copied += bytes_read as u64;
                        progress(bytes_read)?;
                    }

                    break;
                }
                _ => return Err(err.into()),
            },
        }
    }

    Ok(total_copied)
}

pub trait WriteSeek: Write + std::io::Seek {}
impl<T: Write + std::io::Seek> WriteSeek for T {}
pub trait AsyncWriteSeek: tokio::io::AsyncWrite + tokio::io::AsyncSeek + Unpin {}
impl<T: tokio::io::AsyncWrite + tokio::io::AsyncSeek + Unpin> AsyncWriteSeek for T {}
pub trait ReadSeek: Read + std::io::Seek {}
impl<T: Read + std::io::Seek> ReadSeek for T {}
pub trait AsyncReadSeek: tokio::io::AsyncRead + tokio::io::AsyncSeek + Unpin {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncSeek + Unpin> AsyncReadSeek for T {}
pub trait ReadWriteSeek: Read + Write + std::io::Seek {}
impl<T: Read + Write + std::io::Seek> ReadWriteSeek for T {}
pub trait AsyncReadWriteSeek:
    tokio::io::AsyncRead + tokio::io::AsyncWrite + tokio::io::AsyncSeek + Unpin
{
}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + tokio::io::AsyncSeek + Unpin>
    AsyncReadWriteSeek for T
{
}
