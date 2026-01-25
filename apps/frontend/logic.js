function onClickNavHandler() {
    const navLinks = document.querySelectorAll(".nav-menu a");
    
    navLinks.forEach(link => {
      link.addEventListener('click', function(event) {
        event.preventDefault();
        
        const targetSection = event.currentTarget.getAttribute('href').substring(1);
        
        // Hide all sections
        document.querySelectorAll("main section").forEach(section => {
          section.style.display = 'none';
        });
        
        // Remove active class from all links
        navLinks.forEach(el => el.classList.remove('active'));
        
        // Show target section
        const section = document.querySelector(`.${targetSection}`);
        if (section) {
          section.style.display = "flex";
        }
        
        // Add active class to clicked link
        event.currentTarget.classList.add('active');
      });
    });
  }
  
  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', function() {
    // Hide all sections initially
    document.querySelectorAll("main section").forEach(section => {
      section.style.display = 'none';
    });
    
    // Display home section by default
    const homeSection = document.querySelector(".home");
    if (homeSection) {
      homeSection.style.display = 'flex';
    }
    
    // Initialize navigation
    onClickNavHandler();
  });


