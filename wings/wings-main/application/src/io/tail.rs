use std::{
    collections::VecDeque,
    io::{Cursor, SeekFrom},
};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};

/// Seeks backward through an asynchronous reader to find the starting
/// point of the last `lines` lines. Leaves the cursor at that position.
pub async fn async_tail<R: AsyncRead + AsyncSeek + Unpin>(
    mut reader: R,
    lines: usize,
) -> std::io::Result<R> {
    if lines == 0 {
        reader.seek(SeekFrom::End(0)).await?;
        return Ok(reader);
    }

    let file_size = reader.seek(SeekFrom::End(0)).await?;
    if file_size == 0 {
        return Ok(reader);
    }

    let mut current_pos = file_size;
    let mut lines_found = 0;
    let mut buf = vec![0; crate::BUFFER_SIZE];

    while current_pos > 0 {
        let read_size = std::cmp::min(crate::BUFFER_SIZE as u64, current_pos);
        current_pos -= read_size;

        reader.seek(SeekFrom::Start(current_pos)).await?;
        let chunk = &mut buf[..read_size as usize];
        reader.read_exact(chunk).await?;

        for i in (0..read_size as usize).rev() {
            if chunk[i] == b'\n' {
                if current_pos + (i as u64) == file_size - 1 {
                    continue;
                }

                lines_found += 1;

                if lines_found == lines {
                    let start_pos = current_pos + (i as u64) + 1;
                    reader.seek(SeekFrom::Start(start_pos)).await?;
                    return Ok(reader);
                }
            }
        }
    }

    reader.seek(SeekFrom::Start(0)).await?;
    Ok(reader)
}

/// Consumes an entire AsyncRead stream, keeping only the last `lines` lines in memory.
/// Returns a Cursor over the collected bytes, which implements AsyncRead + Send + Unpin.
pub async fn async_tail_stream<R>(reader: R, lines: usize) -> std::io::Result<Cursor<Vec<u8>>>
where
    R: AsyncRead + Unpin,
{
    if lines == 0 {
        return Ok(Cursor::new(Vec::new()));
    }

    let mut buf_reader = tokio::io::BufReader::new(reader);
    let mut buffer: VecDeque<Vec<u8>> = VecDeque::with_capacity(lines);

    loop {
        let mut line = Vec::new();
        let bytes_read = buf_reader.read_until(b'\n', &mut line).await?;

        if bytes_read == 0 {
            break;
        }

        if buffer.len() == lines {
            buffer.pop_front();
        }

        buffer.push_back(line);
    }

    let result = buffer.into_iter().flatten().collect::<Vec<u8>>();

    Ok(Cursor::new(result))
}
