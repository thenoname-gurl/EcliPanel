use std::{
    io::Read,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::io::{AsyncRead, ReadBuf};

pub struct FixedReader<R: Read> {
    inner: R,
    size: usize,
    bytes_read: usize,
}

impl<R: Read> FixedReader<R> {
    pub fn new_with_fixed_bytes(inner: R, size: usize) -> Self {
        Self {
            inner,
            size,
            bytes_read: 0,
        }
    }
}

impl<R: Read> Read for FixedReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.bytes_read >= self.size {
            return Ok(0);
        }

        let remaining = self.size - self.bytes_read;
        let to_read = std::cmp::min(buf.len(), remaining);

        let n = self.inner.read(&mut buf[..to_read])?;

        if crate::unlikely(n == 0) {
            buf[..to_read].fill(0);

            self.bytes_read += to_read;
            return Ok(to_read);
        }

        self.bytes_read += n;
        Ok(n)
    }
}

pub struct AsyncFixedReader<R: AsyncRead + Unpin> {
    inner: R,
    size: usize,
    bytes_read: usize,
}

impl<R: AsyncRead + Unpin> AsyncFixedReader<R> {
    pub fn new_with_fixed_bytes(inner: R, size: usize) -> Self {
        Self {
            inner,
            size,
            bytes_read: 0,
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for AsyncFixedReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        if self.bytes_read >= self.size {
            return Poll::Ready(Ok(()));
        }

        let remaining = self.size - self.bytes_read;
        let to_read = std::cmp::min(buf.remaining(), remaining);

        let raw_slice = buf.initialize_unfilled_to(to_read);
        let mut sub_read_buf = ReadBuf::new(raw_slice);

        match Pin::new(&mut self.inner).poll_read(cx, &mut sub_read_buf) {
            Poll::Ready(Ok(())) => {
                let n = sub_read_buf.filled().len();

                if crate::unlikely(n == 0) {
                    let dest = buf.initialize_unfilled_to(to_read);
                    dest.fill(0);

                    buf.advance(to_read);
                    self.bytes_read += to_read;
                } else {
                    buf.advance(n);
                    self.bytes_read += n;
                }

                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(err)) => Poll::Ready(Err(err)),
            Poll::Pending => Poll::Pending,
        }
    }
}
