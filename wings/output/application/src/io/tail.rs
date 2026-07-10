use crate::io::{SafeSliceExt, SafeSliceMutExt};
use std::{
    collections::VecDeque,
    io::{Cursor, SeekFrom},
};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};

const MAX_LINE_LENGTH: usize = 10 * 1024; // 10 KiB
pub const LINES_CAP: usize = 10_000;

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
        let chunk = buf.get_slice_mut(..read_size as usize)?;
        reader.read_exact(chunk).await?;

        for i in (0..read_size as usize).rev() {
            if chunk.get(i) == Some(&b'\n') {
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

async fn read_line_capped<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut line = Vec::new();
    let mut truncated = false;
    let mut hit_newline = false;

    loop {
        let available = reader.fill_buf().await?;
        if available.is_empty() {
            break;
        }

        let newline = available.iter().position(|&b| b == b'\n');
        let consumed = newline.map_or(available.len(), |idx| idx + 1);

        if line.len() < MAX_LINE_LENGTH {
            let take = (MAX_LINE_LENGTH - line.len()).min(consumed);
            line.extend_from_slice(available.get_slice(..take)?);
            if take < consumed {
                truncated = true;
            }
        } else {
            truncated = true;
        }

        reader.consume(consumed);

        if newline.is_some() {
            hit_newline = true;
            break;
        }
    }

    if line.is_empty() {
        return Ok(None);
    }

    if truncated && hit_newline && line.last() != Some(&b'\n') {
        line.push(b'\n');
    }

    Ok(Some(line))
}

/// Consumes an entire AsyncRead stream, keeping only the last `lines` lines in memory.
/// Returns a Cursor over the collected bytes, which implements AsyncRead + Send + Unpin.
pub async fn async_tail_stream<R: AsyncRead + Unpin>(
    reader: R,
    lines: usize,
) -> std::io::Result<Cursor<Vec<u8>>> {
    if lines == 0 {
        return Ok(Cursor::new(Vec::new()));
    }

    let mut buf_reader = tokio::io::BufReader::new(reader);
    let mut buffer = VecDeque::with_capacity(lines.min(LINES_CAP));

    while let Some(line) = read_line_capped(&mut buf_reader).await? {
        if buffer.len() == lines {
            buffer.pop_front();
        }

        buffer.push_back(line);
    }

    let result = buffer.into_iter().flatten().collect::<Vec<_>>();

    Ok(Cursor::new(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    async fn read_remaining<R: AsyncRead + Unpin>(mut r: R) -> Vec<u8> {
        let mut out = Vec::new();
        r.read_to_end(&mut out).await.unwrap();
        out
    }

    // async_tail

    #[test]
    fn tail_zero_lines_seeks_to_end() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"a\nb\nc\n".to_vec()), 0)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"");
        });
    }

    #[test]
    fn tail_empty_input() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(Vec::new()), 3).await.unwrap();
            assert_eq!(read_remaining(r).await, b"");
        });
    }

    #[test]
    fn tail_with_trailing_newline() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"a\nb\nc\nd\n".to_vec()), 2)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"c\nd\n");
        });
    }

    #[test]
    fn tail_without_trailing_newline() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"a\nb\nc\nd".to_vec()), 2)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"c\nd");
        });
    }

    #[test]
    fn tail_more_lines_than_present_returns_all() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"a\nb\nc\n".to_vec()), 5)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"a\nb\nc\n");
        });
    }

    #[test]
    fn tail_single_line_no_newline() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"hello".to_vec()), 1).await.unwrap();
            assert_eq!(read_remaining(r).await, b"hello");
        });
    }

    #[test]
    fn tail_single_line_trailing_newline_not_a_separator() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"hello\n".to_vec()), 1)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"hello\n");
        });
    }

    #[test]
    fn tail_last_of_several() {
        tokio_test::block_on(async {
            let r = async_tail(Cursor::new(b"hello\nworld\n".to_vec()), 1)
                .await
                .unwrap();
            assert_eq!(read_remaining(r).await, b"world\n");
        });
    }

    #[test]
    fn tail_across_buffer_boundaries() {
        tokio_test::block_on(async {
            let mut lines = Vec::new();
            let mut data = Vec::new();
            let mut i = 0;
            while data.len() <= crate::BUFFER_SIZE * 3 {
                let content = format!("entry-{i:06}").into_bytes();
                data.extend_from_slice(&content);
                data.push(b'\n');
                lines.push(content);
                i += 1;
            }

            let k = 4;
            let mut expected = Vec::new();
            for c in &lines[lines.len() - k..] {
                expected.extend_from_slice(c);
                expected.push(b'\n');
            }

            let r = async_tail(Cursor::new(data), k).await.unwrap();
            assert_eq!(read_remaining(r).await, expected);
        });
    }

    // async_tail_stream

    #[test]
    fn stream_zero_lines() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(b"a\nb\n".to_vec()), 0)
                .await
                .unwrap();
            assert_eq!(c.into_inner(), b"");
        });
    }

    #[test]
    fn stream_keeps_last_lines() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(b"a\nb\nc\nd\n".to_vec()), 2)
                .await
                .unwrap();
            assert_eq!(c.into_inner(), b"c\nd\n");
        });
    }

    #[test]
    fn stream_without_trailing_newline() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(b"a\nb\nc\nd".to_vec()), 2)
                .await
                .unwrap();
            assert_eq!(c.into_inner(), b"c\nd");
        });
    }

    #[test]
    fn stream_more_lines_than_present() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(b"a\nb\nc\n".to_vec()), 5)
                .await
                .unwrap();
            assert_eq!(c.into_inner(), b"a\nb\nc\n");
        });
    }

    #[test]
    fn stream_empty_input() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(Vec::new()), 3).await.unwrap();
            assert_eq!(c.into_inner(), b"");
        });
    }

    #[test]
    fn stream_blank_lines_are_lines() {
        tokio_test::block_on(async {
            let c = async_tail_stream(Cursor::new(b"\n\n\n".to_vec()), 2)
                .await
                .unwrap();
            assert_eq!(c.into_inner(), b"\n\n");
        });
    }

    #[test]
    fn stream_caps_overlong_line() {
        tokio_test::block_on(async {
            let mut data = vec![b'a'; MAX_LINE_LENGTH + 10];
            data.push(b'\n');
            data.extend_from_slice(b"b\n");

            let out = async_tail_stream(Cursor::new(data), 2)
                .await
                .unwrap()
                .into_inner();
            assert_eq!(out.len(), MAX_LINE_LENGTH + 3);
            assert!(out[..MAX_LINE_LENGTH].iter().all(|&b| b == b'a'));
            assert_eq!(out[MAX_LINE_LENGTH], b'\n');
            assert_eq!(&out[MAX_LINE_LENGTH + 1..], b"b\n");
        });
    }

    // read_line_capped

    #[test]
    fn read_line_none_on_empty() {
        tokio_test::block_on(async {
            let mut c = Cursor::new(Vec::new());
            assert_eq!(read_line_capped(&mut c).await.unwrap(), None);
        });
    }

    #[test]
    fn read_line_keeps_its_newline() {
        tokio_test::block_on(async {
            let mut c = Cursor::new(b"abc\n".to_vec());
            assert_eq!(
                read_line_capped(&mut c).await.unwrap(),
                Some(b"abc\n".to_vec())
            );
        });
    }

    #[test]
    fn read_line_final_line_has_no_newline() {
        tokio_test::block_on(async {
            let mut c = Cursor::new(b"abc".to_vec());
            assert_eq!(
                read_line_capped(&mut c).await.unwrap(),
                Some(b"abc".to_vec())
            );
        });
    }

    #[test]
    fn read_line_sequential() {
        tokio_test::block_on(async {
            let mut c = Cursor::new(b"l1\nl2\nl3".to_vec());
            assert_eq!(
                read_line_capped(&mut c).await.unwrap(),
                Some(b"l1\n".to_vec())
            );
            assert_eq!(
                read_line_capped(&mut c).await.unwrap(),
                Some(b"l2\n".to_vec())
            );
            assert_eq!(
                read_line_capped(&mut c).await.unwrap(),
                Some(b"l3".to_vec())
            );
            assert_eq!(read_line_capped(&mut c).await.unwrap(), None);
        });
    }

    #[test]
    fn read_line_truncated_line_gets_synthesized_newline() {
        // overlong line that did contain a newline: capped to MAX, one '\n' re-added
        tokio_test::block_on(async {
            let mut data = vec![b'a'; MAX_LINE_LENGTH + 50];
            data.push(b'\n');
            let mut c = Cursor::new(data);

            let line = read_line_capped(&mut c).await.unwrap().unwrap();
            assert_eq!(line.len(), MAX_LINE_LENGTH + 1);
            assert!(line[..MAX_LINE_LENGTH].iter().all(|&b| b == b'a'));
            assert_eq!(line.last(), Some(&b'\n'));
        });
    }

    #[test]
    fn read_line_truncated_at_eof_without_newline_gets_none_added() {
        tokio_test::block_on(async {
            let mut c = Cursor::new(vec![b'a'; MAX_LINE_LENGTH + 50]);

            let line = read_line_capped(&mut c).await.unwrap().unwrap();
            assert_eq!(line.len(), MAX_LINE_LENGTH);
            assert_ne!(line.last(), Some(&b'\n'));
        });
    }

    #[test]
    fn read_line_spans_small_fill_buf_chunks() {
        // capacity below MAX forces the line to cross many fill_buf/consume cycles
        tokio_test::block_on(async {
            let mut data = vec![b'a'; MAX_LINE_LENGTH + 100];
            data.push(b'\n');
            data.extend_from_slice(b"rest");
            let mut r = BufReader::with_capacity(64, Cursor::new(data));

            let first = read_line_capped(&mut r).await.unwrap().unwrap();
            assert_eq!(first.len(), MAX_LINE_LENGTH + 1);
            assert_eq!(first.last(), Some(&b'\n'));

            assert_eq!(
                read_line_capped(&mut r).await.unwrap(),
                Some(b"rest".to_vec())
            );
            assert_eq!(read_line_capped(&mut r).await.unwrap(), None);
        });
    }
}
