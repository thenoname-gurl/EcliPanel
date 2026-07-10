use crate::io::SafeSliceMutExt;
use std::{
    io::{Read, Seek, SeekFrom},
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, Instant},
};
use tokio::io::{AsyncRead, AsyncSeek, ReadBuf};

const WINDOW: Duration = Duration::from_secs(1);

pub struct LimitedReader<R: Read> {
    inner: R,
    bytes_per_second: u64,
    window_start: Instant,
    bytes_read_in_window: u64,
}

impl<R: Read> LimitedReader<R> {
    pub fn new_with_bytes_per_second(inner: R, bytes_per_second: u64) -> Self {
        Self {
            inner,
            bytes_per_second,
            window_start: Instant::now(),
            bytes_read_in_window: 0,
        }
    }
}

impl<R: Read> Read for LimitedReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if crate::unlikely(buf.is_empty()) {
            return Ok(0);
        }

        if self.bytes_per_second == 0 {
            return self.inner.read(buf);
        }

        let now = Instant::now();
        if now.duration_since(self.window_start) >= WINDOW {
            self.window_start = now;
            self.bytes_read_in_window = 0;
        }

        let mut budget = self.bytes_per_second - self.bytes_read_in_window;
        if budget == 0 {
            let sleep = WINDOW.saturating_sub(now.duration_since(self.window_start));
            if !sleep.is_zero() {
                std::thread::sleep(sleep);
            }

            self.window_start = Instant::now();
            self.bytes_read_in_window = 0;
            budget = self.bytes_per_second;
        }

        let to_read = buf.len().min(budget as usize);
        let bytes_read = self.inner.read(buf.get_slice_mut(..to_read)?)?;
        self.bytes_read_in_window += bytes_read as u64;

        Ok(bytes_read)
    }
}

impl<R: Read + Seek> Seek for LimitedReader<R> {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.inner.seek(pos)
    }
}

pub struct AsyncLimitedReader<R: AsyncRead + Unpin> {
    inner: R,
    bytes_per_second: u64,
    window_start: Instant,
    bytes_read_in_window: u64,
    delay_future: Option<Pin<Box<tokio::time::Sleep>>>,
}

impl<R: AsyncRead + Unpin> AsyncLimitedReader<R> {
    pub fn new_with_bytes_per_second(inner: R, bytes_per_second: u64) -> Self {
        Self {
            inner,
            bytes_per_second,
            window_start: Instant::now(),
            bytes_read_in_window: 0,
            delay_future: None,
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for AsyncLimitedReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.as_mut().get_mut();

        if crate::unlikely(buf.remaining() == 0) {
            return Poll::Ready(Ok(()));
        }

        if this.bytes_per_second == 0 {
            return Pin::new(&mut this.inner).poll_read(cx, buf);
        }

        if let Some(delay) = &mut this.delay_future {
            match delay.as_mut().poll(cx) {
                Poll::Ready(_) => {
                    this.delay_future = None;
                    this.window_start = Instant::now();
                    this.bytes_read_in_window = 0;
                }
                Poll::Pending => return Poll::Pending,
            }
        }

        let now = Instant::now();
        if now.duration_since(this.window_start) >= WINDOW {
            this.window_start = now;
            this.bytes_read_in_window = 0;
        }

        let budget = this.bytes_per_second - this.bytes_read_in_window;
        if budget == 0 {
            let sleep = WINDOW.saturating_sub(now.duration_since(this.window_start));
            let mut delay = Box::pin(tokio::time::sleep(sleep));

            match delay.as_mut().poll(cx) {
                Poll::Ready(_) => {
                    this.window_start = Instant::now();
                    this.bytes_read_in_window = 0;
                }
                Poll::Pending => {
                    this.delay_future = Some(delay);
                    return Poll::Pending;
                }
            }
        }

        let budget = this.bytes_per_second - this.bytes_read_in_window;
        let to_read = buf.remaining().min(budget as usize);

        let mut tmp = ReadBuf::new(buf.initialize_unfilled_to(to_read));

        match Pin::new(&mut this.inner).poll_read(cx, &mut tmp) {
            Poll::Ready(Ok(())) => {
                let bytes_read = tmp.filled().len();

                buf.advance(bytes_read);
                this.bytes_read_in_window += bytes_read as u64;

                Poll::Ready(Ok(()))
            }
            other => other,
        }
    }
}

impl<R: AsyncRead + AsyncSeek + Unpin> AsyncSeek for AsyncLimitedReader<R> {
    fn start_seek(self: Pin<&mut Self>, position: SeekFrom) -> std::io::Result<()> {
        Pin::new(&mut self.get_mut().inner).start_seek(position)
    }

    fn poll_complete(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<u64>> {
        Pin::new(&mut self.get_mut().inner).poll_complete(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use tokio::io::AsyncReadExt;

    fn read_all<R: Read>(mut r: R) -> usize {
        let mut buf = [0; 1024];
        let mut total = 0;
        loop {
            let n = r.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            total += n;
        }
        total
    }

    async fn read_all_async<R: AsyncRead + Unpin>(mut r: R) -> usize {
        let mut buf = [0; 1024];
        let mut total = 0;
        loop {
            let n = r.read(&mut buf).await.unwrap();
            if n == 0 {
                break;
            }
            total += n;
        }
        total
    }

    // LimitedReader

    #[test]
    fn limited_reader_clamps_read_to_window_budget() {
        let mut r = LimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 1024]), 100);

        let mut buf = [0; 1024];
        assert_eq!(r.read(&mut buf).unwrap(), 100);
    }

    #[test]
    fn limited_reader_zero_limit_passes_through() {
        let mut r = LimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 1024]), 0);

        let mut buf = [0; 1024];
        assert_eq!(r.read(&mut buf).unwrap(), 1024);
    }

    #[test]
    fn limited_reader_enforces_rate_over_time() {
        let r = LimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 250]), 100);

        // 250 bytes at 100 B/s: 100 in the first window, the rest needs 2 more windows
        let start = Instant::now();
        assert_eq!(read_all(r), 250);
        assert!(start.elapsed() >= Duration::from_secs(2));
    }

    // AsyncLimitedReader

    #[test]
    fn async_limited_reader_clamps_read_to_window_budget() {
        tokio_test::block_on(async {
            let mut r =
                AsyncLimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 1024]), 100);

            let mut buf = [0; 1024];
            assert_eq!(r.read(&mut buf).await.unwrap(), 100);
        });
    }

    #[test]
    fn async_limited_reader_zero_limit_passes_through() {
        tokio_test::block_on(async {
            let mut r =
                AsyncLimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 1024]), 0);

            let mut buf = [0; 1024];
            assert_eq!(r.read(&mut buf).await.unwrap(), 1024);
        });
    }

    #[test]
    fn async_limited_reader_enforces_rate_over_time() {
        tokio_test::block_on(async {
            let r = AsyncLimitedReader::new_with_bytes_per_second(Cursor::new(vec![0; 250]), 100);

            let start = Instant::now();
            assert_eq!(read_all_async(r).await, 250);
            assert!(start.elapsed() >= Duration::from_secs(2));
        });
    }
}
