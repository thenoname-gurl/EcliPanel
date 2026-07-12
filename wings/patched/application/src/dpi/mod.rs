pub mod capture;
pub mod engine;

use ndpi_sys::*;
use std::ffi::CStr;
use std::ptr;

pub struct VpnDpiDetector {
    module: *mut NDPIDetectionModule,
    flow_size: usize,
}

unsafe impl Send for VpnDpiDetector {}

#[derive(Debug, Clone)]
pub struct DetectedProtocol {
    pub name: String,
    pub category: String,
    pub packet_count: u32,
}

impl VpnDpiDetector {
    pub fn new() -> Option<Self> {
        let module = unsafe { ndpi_init_detection_module(1000) };
        if module.is_null() {
            tracing::warn!("nDPI: failed to initialize detection module (libndpi installed?)");
            return None;
        }
        unsafe { ndpi_finalize_initialization(module) };
        let flow_size = unsafe { ndpi_detection_get_sizeof_ndpi_flow_struct() as usize };
        tracing::info!("nDPI: detection module initialized (flow_struct size={})", flow_size);
        Some(Self { module, flow_size })
    }

    pub fn classify_packet(&mut self, ip_packet: &[u8]) -> Option<DetectedProtocol> {
        if ip_packet.len() > u16::MAX as usize {
            return None;
        }

        let mut flow_buf = vec![0u8; self.flow_size];
        let flow_ptr = flow_buf.as_mut_ptr() as *mut NDPIFlowStruct;

        let result = unsafe {
            ndpi_detection_process_packet(
                self.module,
                flow_ptr,
                ip_packet.as_ptr(),
                ip_packet.len() as u16,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        };

        unsafe { ndpi_free_flow_data(flow_ptr) };

        let proto_id = if result.app_protocol != NDPI_PROTOCOL_UNKNOWN {
            result.app_protocol
        } else if result.master_protocol != NDPI_PROTOCOL_UNKNOWN {
            result.master_protocol
        } else {
            return None;
        };

        let name = unsafe {
            let ptr = ndpi_get_proto_name(self.module, proto_id);
            if ptr.is_null() {
                return None;
            }
            CStr::from_ptr(ptr).to_string_lossy().into_owned()
        };

        let category = unsafe {
            let ptr = ndpi_category_get_name(self.module, result.category);
            if ptr.is_null() {
                "Unknown".to_string()
            } else {
                CStr::from_ptr(ptr).to_string_lossy().into_owned()
            }
        };

        Some(DetectedProtocol {
            name,
            category,
            packet_count: 1,
        })
    }
}

impl Drop for VpnDpiDetector {
    fn drop(&mut self) {
        unsafe { ndpi_exit_detection_module(self.module) };
    }
}
